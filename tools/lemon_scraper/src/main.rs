use reqwest::header::{HeaderMap, USER_AGENT};
use scraper::{Html, Selector};
use serde::Serialize;
use std::time::Instant;
use tokio::time::{sleep, Duration};

#[derive(Serialize)]
struct Extract {
    url: String,
    matches: Vec<String>,
    duration_ms: u128,
}

async fn fetch_with_retries(client: &reqwest::Client, url: &str, attempts: u8) -> Result<String, reqwest::Error> {
    let mut last_err = None;
    for i in 0..attempts {
        match client.get(url).send().await {
            Ok(resp) => return resp.text().await,
            Err(e) => {
                last_err = Some(e);
                let backoff = Duration::from_secs(1 + (i as u64) * 2);
                sleep(backoff).await;
            }
        }
    }
    Err(last_err.unwrap())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let start_time = Instant::now();

    let url = std::env::args().nth(1).unwrap_or_else(|| {
        "https://lemon-manuals.la/Hyundai/2005/Tucson%20V6-2.7L/Repair%20and%20Diagnosis/Technical%20Service%20Bulletins/All%20Technical%20Service%20Bulletins/Suspension%20-%20Strut%20Tower%20Bar%20Torque%20Specification/".to_string()
    });

    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".parse()?,
    );

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()?;

    let body = fetch_with_retries(&client, &url, 3).await?;

    let document = Html::parse_document(&body);
    let selector = Selector::parse("main, #content, .content, body").unwrap();

    let mut matches: Vec<String> = Vec::new();

    if let Some(element) = document.select(&selector).next() {
        let text: Vec<String> = element
            .text()
            .map(|t| t.trim().replace('\n', " ").replace('\t', " "))
            .filter(|t| !t.is_empty())
            .map(|s| s.to_string())
            .collect();

        for line in text {
            if line.contains("Torque") || line.contains("Nm") || line.contains("lb-ft") || line.contains("Specification") {
                matches.push(line);
            }
        }
    }

    let duration = start_time.elapsed();
    let out = Extract {
        url,
        matches,
        duration_ms: duration.as_millis(),
    };

    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
