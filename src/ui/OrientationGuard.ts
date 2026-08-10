/**
 * OrientationGuard — Detects portrait mode on smartphone screens and displays
 * a sleek glassmorphic overlay prompting the user to rotate to landscape.
 */

export class OrientationGuard {
  private overlay: HTMLElement | null = null;
  private isPortrait = false;

  constructor() {
    this.createDomElements();
    this.checkOrientation();
    this.bindEvents();
  }

  private createDomElements(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'orientation-guard-overlay';
    this.overlay.className = 'orientation-overlay';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="orientation-modal glass-panel">
        <div class="phone-rotate-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
            <path d="M12 18h.01"/>
            <path d="M19 9l3 3-3 3"/>
          </svg>
        </div>
        <h2>ROTATE YOUR DEVICE</h2>
        <p>This 3D FPV Drone Simulator requires <strong>Landscape Mode</strong> for optimal mobile flight controls.</p>
        <button class="btn btn-primary" id="btn-lock-landscape">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          Enter Fullscreen & Rotate
        </button>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const btnLock = document.getElementById('btn-lock-landscape');
    btnLock?.addEventListener('click', () => {
      this.requestLandscapeFullscreen();
    });
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());

    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => this.checkOrientation());
    }
  }

  public checkOrientation(): void {
    const isMobileSize = window.innerWidth <= 900 || window.innerHeight <= 600;
    const isPortraitMode = window.innerHeight > window.innerWidth;

    if (isMobileSize && isPortraitMode) {
      this.isPortrait = true;
      if (this.overlay) this.overlay.style.display = 'flex';
    } else {
      this.isPortrait = false;
      if (this.overlay) this.overlay.style.display = 'none';
    }
  }

  private async requestLandscapeFullscreen(): Promise<void> {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      }

      if (screen.orientation && 'lock' in screen.orientation) {
        // @ts-ignore lock orientation if supported
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.log('Fullscreen/Orientation request bypassed:', e);
    }
    this.checkOrientation();
  }
}
