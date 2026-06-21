const axios = require("axios");
const NodeCache = require("node-cache");

// Cache parts lookups for 30 minutes to reduce API latency
const cache = new NodeCache({ stdTTL: 1800 });

async function lookupPart(partNumberOrName, vin, vehicleText) {
  const key = `parts:${partNumberOrName}:${vin}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const results = { local: [], online: [] };
  const push = (bucket, obj) => bucket.push(obj);

  // 🏪 LOCAL COMMERCIAL AUTOMOTIVE HOUSES
  const localStores = [
    { name: "AutoZone", url: `https://api.autozone.com/lookup/${encodeURIComponent(partNumberOrName)}` },
    { name: "OReilly", url: `https://api.oreillyauto.com/lookup/${encodeURIComponent(partNumberOrName)}` },
    { name: "NAPA", url: `https://api.napaonline.com/lookup/${encodeURIComponent(partNumberOrName)}` },
    { name: "Advance Auto", url: `https://api.advanceautoparts.com/lookup/${encodeURIComponent(partNumberOrName)}` }
  ];

  for (const store of localStores) {
    try {
      const r = await axios.get(store.url, { timeout: 3000 });
      if (r.data?.in_stock) {
        push(results.local, {
          source: store.name,
          price: r.data.price,
          pickup_eta: r.data.eta || "In Store Today",
          order_url: r.data.order_url || "#",
          confidence: r.data.confidence || "medium"
        });
      }
    } catch {
      // Fail silently and keep hunting other stores
    }
  }

  // 🌐 ONLINE HIGH-VOLUME DISTRIBUTORS
  const onlineStores = [
    { name: "RockAuto", url: `https://api.rockauto.com/lookup/${encodeURIComponent(partNumberOrName)}` },
    { name: "Amazon", url: `https://api.amazon.com/parts/${encodeURIComponent(partNumberOrName)}` },
    { name: "eBay", url: `https://api.ebay.com/parts/${encodeURIComponent(partNumberOrName)}` }
  ];

  for (const store of onlineStores) {
    try {
      const r = await axios.get(store.url, { timeout: 3000 });
      if (r.data?.price) {
        push(results.online, {
          source: store.name,
          price: r.data.price,
          shipping_eta: r.data.eta || "2-3 Days",
          order_url: r.data.order_url || "#",
          confidence: r.data.confidence || "medium"
        });
      }
    } catch {
      // Fail silently and move down the manifest
    }
  }

  // Sort choices so the absolute lowest price sits right on top
  results.local.sort((a, b) => a.price - b.price);
  results.online.sort((a, b) => a.price - b.price);

  cache.set(key, results);
  return results;
}

module.exports = { lookupPart };
