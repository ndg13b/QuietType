/**
 * All the interactive chrome: the welcome panel, the mood switcher, the sound
 * and volume controls, the export menu, the about panel and the toast.
 *
 * The controls know nothing about audio or typing -- they take callbacks and
 * report what the user did.
 */

export class Controls {
  #callbacks;
  #els;
  #toastTimer = 0;

  /**
   * @param {object} options
   * @param {object[]} options.moods mood presets, in display order
   * @param {object} options.on callbacks: mood, sound, volume, export, clear, begin
   */
  constructor({ moods, on = {} }) {
    this.#callbacks = on;
    this.#els = {
      welcome: document.getElementById('welcome'),
      welcomeMoods: document.getElementById('welcome-moods'),
      app: document.getElementById('app'),
      moods: document.querySelector('.moods'),
      sound: document.getElementById('sound-toggle'),
      volume: document.getElementById('volume'),
      exportToggle: document.getElementById('export-toggle'),
      exportList: document.getElementById('export-list'),
      aboutToggle: document.getElementById('about-toggle'),
      about: document.getElementById('about'),
      clear: document.getElementById('clear-note'),
      toast: document.getElementById('toast'),
      note: document.getElementById('note'),
    };

    this.#renderMoods(moods);
    this.#renderWelcome(moods);
    this.#wireSound();
    this.#wireExport();
    this.#wireAbout();
  }

  /* ------------------------------------------------------------- moods */

  #renderMoods(moods) {
    this.#els.moods.replaceChildren(
      ...moods.map((mood) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'radio';
        button.dataset.mood = mood.id;
        button.textContent = mood.name;
        button.setAttribute('aria-checked', 'false');
        button.tabIndex = -1;
        button.title = mood.description;
        button.addEventListener('click', () => this.#callbacks.mood?.(mood.id));
        return button;
      }),
    );

    // Roving focus, so the group behaves like a real radio group.
    this.#els.moods.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const step = keys[event.key];
      if (!step) return;
      event.preventDefault();
      const buttons = [...this.#els.moods.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const next = buttons[(index + step + buttons.length) % buttons.length];
      next?.focus();
      this.#callbacks.mood?.(next.dataset.mood);
    });
  }

  #renderWelcome(moods) {
    this.#els.welcomeMoods.replaceChildren(
      ...moods.map((mood) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mood = mood.id;
        button.innerHTML =
          `<em></em><strong></strong><small></small>`;
        button.querySelector('em').textContent = mood.tagline;
        button.querySelector('strong').textContent = mood.name;
        button.querySelector('small').textContent = mood.description;
        button.addEventListener('click', () => this.#callbacks.begin?.(mood.id));
        return button;
      }),
    );
  }

  setMood(id) {
    for (const button of this.#els.moods.querySelectorAll('button')) {
      const active = button.dataset.mood === id;
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    }
  }

  /* ------------------------------------------------------------- sound */

  #wireSound() {
    this.#els.sound.addEventListener('click', () => this.#callbacks.sound?.());
    this.#els.volume.addEventListener('input', (event) => {
      this.#callbacks.volume?.(Number(event.target.value) / 100);
    });
  }

  /**
   * @param {{ enabled: boolean, live: boolean, label?: string }} state
   *   `enabled` is the user's mute switch; `live` is whether audio is actually
   *   running, which stays false until the engine has started.
   */
  setSoundState({ enabled, live, label }) {
    this.#els.sound.setAttribute('aria-pressed', String(enabled));
    this.#els.sound.dataset.live = String(Boolean(live));
    this.#els.sound.querySelector('.tool__label').textContent =
      label ?? (enabled ? 'Sound on' : 'Muted');
  }

  setVolume(value) {
    this.#els.volume.value = String(Math.round(value * 100));
  }

  /* ------------------------------------------------------------ export */

  #wireExport() {
    const { exportToggle, exportList } = this.#els;

    exportToggle.addEventListener('click', () => {
      this.#setExportOpen(exportList.hidden);
    });

    exportList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-export]');
      if (!button) return;
      this.#setExportOpen(false);
      this.#callbacks.export?.(button.dataset.export);
    });

    document.addEventListener('click', (event) => {
      if (!this.#els.exportList.hidden && !event.target.closest('#export-menu')) {
        this.#setExportOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#els.exportList.hidden) {
        this.#setExportOpen(false);
        this.#els.exportToggle.focus();
      }
    });
  }

  #setExportOpen(open) {
    this.#els.exportList.hidden = !open;
    this.#els.exportToggle.setAttribute('aria-expanded', String(open));
    if (open) this.#els.exportList.querySelector('button')?.focus();
  }

  /** Disable the export list while a format is being generated. */
  setExporting(busy) {
    for (const button of this.#els.exportList.querySelectorAll('button')) {
      button.disabled = busy;
    }
  }

  /* ------------------------------------------------------------- about */

  #wireAbout() {
    const { aboutToggle, about, clear } = this.#els;
    aboutToggle.addEventListener('click', () => {
      const open = about.hidden;
      about.hidden = !open;
      aboutToggle.setAttribute('aria-expanded', String(open));
    });
    clear.addEventListener('click', () => this.#callbacks.clear?.());
  }

  /* ----------------------------------------------------------- welcome */

  /** Reveal the editor and hand focus to the textarea. */
  dismissWelcome() {
    this.#els.welcome.hidden = true;
    this.#els.app.removeAttribute('inert');
    this.#els.note.focus();
  }

  /* ------------------------------------------------------------- toast */

  toast(message, { duration = 4200 } = {}) {
    const node = this.#els.toast;
    node.textContent = message;
    node.dataset.visible = 'true';
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => {
      node.dataset.visible = 'false';
    }, duration);
  }
}
