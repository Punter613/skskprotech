const axios = require('axios');

async function lookupPart(partNumber) {
  const local = await tryLocalStores(partNumber);
  if (local) return local;

  return await tryOnlineStores(partNumber);
}

async function tryLocalStores(partNumber) {
  const stores = [
    { name: 'AutoZone', url: `https://api.autozone.com/parts/${partNumber}` },
    { name: 'OReilly', url: `https://api.oreillyauto.com/lookup/${partNumber}` }
  ];

  for (const s of stores) {
    try {
      const res = await axios.get(s.url, { timeout: 2000 });
      if (res.data?.in_stock) {
        return {
          source: s.name,
          price: res.data.price,
          pickup_eta: res.data.eta || "Immediate Pickup",
          order_url: res.data.order_url
        };
      }
    } catch {}
  }
  return null;
}

async function tryOnlineStores(partNumber) {
  const sources = [
    { name: 'RockAuto', url: `https://api.rockauto.com/parts/${partNumber}` },
    { name: 'Amazon', url: `https://api.amazon.com/parts/${partNumber}` }
  ];

  for (const s of sources) {
    try {
      const res = await axios.get(s.url, { timeout: 2000 });
      if (res.data?.price) {
        return {
          source: s.name,
          price: res.data.price,
          shipping_eta: res.data.eta || "2-Day Shipping",
          order_url: res.data.order_url
        };
      }
    } catch {}
  }
  return null;
}

module.exports = { lookupPart };
