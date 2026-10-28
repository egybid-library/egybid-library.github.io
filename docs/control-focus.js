// Native selects may retain focus after their menu closes, even on pointer input.
// Keep the focus indicator for keyboard use and release selects on outside clicks.
(function(){
 'use strict';
 document.addEventListener('pointerdown',event=>{
  document.documentElement.dataset.inputMethod='pointer';
  const active=document.activeElement;
  if(active instanceof HTMLSelectElement&&!active.contains(event.target))active.blur();
 },true);
 document.addEventListener('keydown',event=>{
  if(!['Shift','Control','Alt','Meta'].includes(event.key))document.documentElement.dataset.inputMethod='keyboard';
 },true);
})();
