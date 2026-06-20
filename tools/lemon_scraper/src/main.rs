use reqwest::header::{HeaderMap, HeaderValue};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
struct ScrapedItem {
    title: String,
    url: String,
    price: Option<f64>,
    meta: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct ScrapResult {
    items: Vec<ScrapedItem>,
    crawled_urls: usize,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let start_time = Instant::now();

    let mut base_url = "https://lemon-manuals.la/Hyundai/2005/Tucson%20V6-2.7L/Repair%20and%20Diagnosis/".to_string();

    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        base_url = args[1].clone();
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    );

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let mut items = Vec::with_capacity(100);
    let mut visited: HashSet<String> = HashSet::new();
    let max_depth = 2;
    let max_pages = 20;

    let mut queue: Vec<(String, usize)> = vec![(base_url, 0)];

    while let Some((current_url, current_depth)) = queue.pop() {
        if current_depth > max_depth {
            continue;
        }

        if visited.contains(&current_url) {
            continue;
        }

        if visited.len() >= max_pages {
            eprintln!("⚠️  Reached max pages limit ({})", max_pages);
            break;
        }

        visited.insert(current_url.clone());

        // ✅ Fixed timeout pattern
        let response = match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            client.get(&current_url).send()
        ).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => continue,
            Err(_) => continue,
        };

        let html = match response.text().await {
            Ok(txt) => txt,
            Err(_) => continue,
        };

        let document = Html::parse_document(&html);

        let title_selector = Selector::parse("title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>())
            .unwrap_or_else(|| "Unknown Manual".to_string());

        items.push(ScrapedItem {
            title: title.trim().to_string(),
            url: current_url.clone(),
            price: None,
            meta: HashMap::new(),
        });

        let link_selector = Selector::parse("a[href]").unwrap();

        for element in document.select(&link_selector) {
            if let Some(href) = element.value().attr("href") {
                let full_url = normalize_url(&current_url, href);

                if (full_url.contains("lemon-manuals.la")
                   || full_url.contains("lemon-manuals.org.ua")
                   || full_url.contains("lemon-manuals.gy"))
                   && !full_url.ends_with(".pdf")
                   && !full_url.contains('#') {

                    if full_url.ends_with('/') {
                        queue.push((full_url, current_depth + 1));
                    }
                }
            }
        }
    }

    items.sort_by(|a, b| (&a.url, &a.title).cmp(&(&b.url, &b.title)));
    items.dedup_by(|a, b| a.url == b.url && a.title == b.title);

    let result = ScrapResult {
        items,
        crawled_urls: visited.len(),
    };

    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}

fn normalize_url(base: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }

    if href.starts_with('/') {
        if let Some(end_idx) = base.find("//") {
            if let Some(slash_idx) = base[end_idx + 2..].find('/') {
                return base[..end_idx + 2 + slash_idx].to_string() + href;
            }
        }
        return "https://lemon-manuals.la".to_string() + href;
    }

    let base_clean = base.trim_end_matches('/');
    format!("{}/{}", base_clean, href)
}
