/**
 * Screens UI overlays helper to show/hide modals (Start, Game Over, Victory).
 */

export function showStartScreen(controlMethodText: string, currentEnv: 'outdoor' | 'indoor'): void {
  const controlDetected = document.getElementById('control-detected');
  if (controlDetected) {
    controlDetected.innerHTML = controlMethodText;
    if (controlMethodText.includes('Keyboard')) {
      controlDetected.style.color = 'var(--text-muted)';
    } else if (controlMethodText.includes('waiting for remote power')) {
      controlDetected.style.color = 'var(--warning)';
    } else {
      controlDetected.style.color = 'var(--success)';
    }
  }

  document.getElementById('btn-env-outdoor')?.classList.toggle('active', currentEnv === 'outdoor');
  document.getElementById('btn-env-indoor')?.classList.toggle('active', currentEnv === 'indoor');

  document.getElementById('screen-start')?.classList.remove('hidden');
  document.getElementById('screen-gameover')?.classList.add('hidden');
  document.getElementById('screen-victory')?.classList.add('hidden');
}

export function hideAllScreens(): void {
  document.getElementById('screen-start')?.classList.add('hidden');
  document.getElementById('screen-gameover')?.classList.add('hidden');
  document.getElementById('screen-victory')?.classList.add('hidden');
}
