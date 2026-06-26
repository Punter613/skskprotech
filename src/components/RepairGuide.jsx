import React, { useState } from 'react';

export default function RepairGuide() {
  const [vehicle, setVehicle] = useState('2005 Hyundai Tucson V6-2.7L');
  const [job, setJob] = useState('Replace Front Brake Pads');
  const [loading, setLoading] = useState(false);
  const [guideData, setGuideData] = useState(null);
  const [completedSteps, setCompletedSteps] = useState({});

  const fetchRepairGuide = async () => {
    setLoading(true);
    setGuideData(null);
    setCompletedSteps({});
    try {
      const scrapeRes = await fetch('https://p613-backend.onrender.com/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://lemon-manuals.la/Hyundai/2005/Tucson%20V6-2.7L/Repair%20and%20Diagnosis/' })
      });
      const scrapeData = await scrapeRes.json();

      const guideRes = await fetch('https://p613-backend.onrender.com/api/diagnose/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle,
          job,
          scrapedItems: scrapeData.results || []
        })
      });
      const finalData = await guideRes.json();
      if (finalData.success) {
        setGuideData(finalData);
      }
    } catch (err) {
      console.error('Shop floor data pipeline leak:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 max-w-md mx-auto font-sans selection:bg-orange-500 selection:text-white">
      <div className="border-b border-zinc-800 pb-4 mb-6">
        <h1 className="text-xl font-black uppercase tracking-wider text-orange-500">🔧 SKSK ProTech</h1>
        <p className="text-xs text-zinc-400">Factory Specs & AI Field Manual Ecosystem</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 shadow-xl mb-6">
        <div>
          <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Vehicle Footprint</label>
          <input 
            type="text" 
            value={vehicle} 
            onChange={(e) => setVehicle(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-zinc-400 mb-1">Target Repair Job</label>
          <input 
            type="text" 
            value={job} 
            onChange={(e) => setJob(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <button 
          onClick={fetchRepairGuide}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-black text-sm uppercase py-3 rounded-lg transition-all tracking-wider shadow-lg shadow-orange-900/20"
        >
          {loading ? '⚙️ Running Scraper & Groq...' : 'Generate Step-by-Step Field Guide'}
        </button>
      </div>

      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-xl"></div>
          <div className="h-40 bg-zinc-900 border border-zinc-800 rounded-xl"></div>
        </div>
      )}

      {guideData && (
        <div className="space-y-6">
          {guideData.sourcesUsed?.length > 0 && (
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3">
              <span className="text-[10px] font-black uppercase text-emerald-400 block mb-1.5 tracking-widest">✓ Grounded Truth Sources Found</span>
              <div className="space-y-1">
                {guideData.sourcesUsed.map((source, i) => (
                  <a 
                    key={i} 
                    href={source.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="block text-xs text-emerald-300 underline truncate hover:text-emerald-200"
                  >
                    🔗 {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-2xl space-y-6">
            <div className="border-b border-zinc-800 pb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-500">Active Blueprint</span>
              <h2 className="text-lg font-bold text-zinc-100">{guideData.job}</h2>
              <p className="text-xs text-zinc-400">{guideData.vehicle}</p>
            </div>

            <div className="prose prose-invert max-w-none text-sm text-zinc-300 space-y-4 leading-relaxed whitespace-pre-wrap">
              {guideData.guide}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
