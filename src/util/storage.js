/**
 * Local-only persistence.
 *
 * Drafts and preferences live in this browser's localStorage and nowhere else
 * -- there is no backend to send them to. Every call degrades to a no-op when
 * storage is unavailable (private windows, storage disabled, quota exceeded),
 * because losing a draft is bad but breaking the editor is worse.
 */

const DRAFT_KEY = 'quiettype:draft';
const PREFS_KEY = 'quiettype:prefs';

/** @returns {Storage | null} */
function store() {
  try {
    const local = globalThis.localStorage;
    // Touch it: Safari's private mode throws only on write.
    const probe = '__quiettype__';
    local.setItem(probe, '1');
    local.removeItem(probe);
    return local;
  } catch {
    return null;
  }
}

const available = store();

export const storageAvailable = available !== null;

export function loadDraft() {
  try {
    return available?.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(text) {
  try {
    if (text) available?.setItem(DRAFT_KEY, text);
    else available?.removeItem(DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft() {
  try {
    available?.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** @returns {{ mood?: string, volume?: number, muted?: boolean, autosave?: boolean }} */
export function loadPreferences() {
  try {
    const raw = available?.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function savePreferences(preferences) {
  try {
    available?.setItem(PREFS_KEY, JSON.stringify(preferences));
  } catch {
    /* preferences are a convenience, not a requirement */
  }
}
