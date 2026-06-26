function resetDiagnosticForm() {
  // 1. Clear input fields
  document.getElementById('customerStates').value = '';
  document.getElementById('obdCodes').value = '';

  // 2. Clear mechanic notices array + UI
  window.currentMechanicNotices = [];
  const list = document.getElementById('noticesList');
  if (list) list.innerHTML = '';

  // 3. Reset estimate metadata UI
  const banner = document.getElementById('estimate-ready-banner');
  if (banner) banner.style.display = 'none';

  const output = document.getElementById('diagnosis-output');
  if (output) output.innerText = 'Awaiting input...';

  // 4. Clear caches
  window.currentEstimateCache = null;
  window.sessionStorage.removeItem('currentEstimate');

  console.log('[UI] Form and Mechanic Notices purged. Ready for fresh continuous diagnosis input.');
}
