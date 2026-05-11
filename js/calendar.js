// calendar.js — main application logic

import { MOCK_DATA } from './mockData.js';
import {
  formatDate, formatDateJP, formatDateTimeJP,
  getDaysInMonth, getHolidayName, parseDateStr,
} from './utils.js';
import { StorageManager } from './storage.js';
import { ModalController } from './modal.js';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const modal = new ModalController();

class CalendarApp {
  constructor() {
    this.data = MOCK_DATA;
    this.selections = {};      // { 'YYYY-MM-DD': string[] }
    this.notes = '';
    this.submitted = false;
    this.submittedAt = null;
    this.selectedDate = null;  // currently editing date
    this.tempSelections = [];  // scratch pad for shift modal

    this._load();
    this._render();
    this._bindEvents();
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  _load() {
    const saved = StorageManager.load();
    if (!saved) return;
    this.selections = saved.selections || {};
    this.notes = saved.notes || '';
    this.submitted = saved.submitted || false;
    this.submittedAt = saved.submittedAt || null;
  }

  _save() {
    StorageManager.save({
      selections: this.selections,
      notes: this.notes,
      submitted: this.submitted,
      submittedAt: this.submittedAt,
    });
  }

  // ─── Top-level render ────────────────────────────────────────────────────────

  _render() {
    this._renderHeader();
    this._renderCalendar();
    this._renderActionBar();
    document.body.classList.toggle('is-submitted', this.submitted);
    // Measure actual bar heights after paint and adjust layout
    requestAnimationFrame(() => this._adjustLayout());
  }

  _adjustLayout() {
    const header    = document.querySelector('.app-header');
    const infobar   = document.querySelector('.info-bar');
    const msgbar    = document.getElementById('msgBar');
    const banner    = document.getElementById('submittedBanner');
    const progress  = document.querySelector('.progress-bar');
    const wrapper   = document.querySelector('.calendar-wrapper');
    if (!header || !infobar || !msgbar || !progress || !wrapper) return;

    const hH = header.offsetHeight;    // ~56
    const hI = infobar.offsetHeight;   // ~48
    const hM = msgbar.offsetHeight;    // actual, varies with text wrap
    const hP = progress.offsetHeight;  // ~36
    const hB = (banner && !banner.hidden) ? banner.offsetHeight : 0;

    const topProgress = hH + hI + hM;

    if (banner) banner.style.top = `${topProgress}px`;
    progress.style.top  = `${topProgress + hB}px`;
    wrapper.style.paddingTop = `${topProgress + hB + hP}px`;
  }

  _renderHeader() {
    const { deadline } = this.data;
    const dlEl = document.getElementById('deadline');
    if (dlEl) {
      const overdue = new Date() > deadline;
      dlEl.textContent = `提出期限: ${deadline.getFullYear()}年${deadline.getMonth() + 1}月${deadline.getDate()}日 `
        + `${String(deadline.getHours()).padStart(2, '0')}:${String(deadline.getMinutes()).padStart(2, '0')}`;
      dlEl.classList.toggle('overdue', overdue);
      if (overdue) dlEl.textContent += ' ⚠';
    }

    const infoMsgEl = document.getElementById('infoMessage');
    if (infoMsgEl && this.data.infoMessage) {
      infoMsgEl.textContent = this.data.infoMessage;
    }

    const banner = document.getElementById('submittedBanner');
    if (banner) {
      if (this.submitted && this.submittedAt) {
        banner.textContent = `✓ 提出済み　${formatDateTimeJP(new Date(this.submittedAt))}`;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }
  }

  _renderCalendar() {
    const { year, month } = this.data.targetMonth;
    const daysCount = getDaysInMonth(year, month);
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    // ── Day-of-week headers ──
    DAY_NAMES.forEach((name, i) => {
      const h = document.createElement('div');
      h.className = `cal-header${i === 0 ? ' col-sun' : i === 6 ? ' col-sat' : ''}`;
      h.textContent = name;
      grid.appendChild(h);
    });

    // ── Leading empty cells ──
    for (let i = 0; i < firstDow; i++) {
      grid.appendChild(this._emptyCell());
    }

    // ── Day cells ──
    for (let d = 1; d <= daysCount; d++) {
      const date = new Date(year, month - 1, d);
      const dateStr = formatDate(date);
      const dow = date.getDay();
      const holiday = getHolidayName(dateStr, this.data.holidays);
      grid.appendChild(this._buildDayCell(d, dow, dateStr, holiday));
    }

    // ── Trailing empty cells ──
    const trailing = (7 - ((firstDow + daysCount) % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
      grid.appendChild(this._emptyCell());
    }

    this._updateProgress();
  }

  _emptyCell() {
    const el = document.createElement('div');
    el.className = 'cal-cell cal-empty';
    return el;
  }

  _buildDayCell(day, dow, dateStr, holiday) {
    const shifts = this.selections[dateStr] || [];
    const isSun = dow === 0;
    const isSat = dow === 6;
    const isHoliday = !!holiday;
    const isRed = isSun || isHoliday;

    const cell = document.createElement('div');
    cell.className = [
      'cal-cell',
      isRed ? 'col-sun' : isSat ? 'col-sat' : '',
      isHoliday ? 'is-holiday' : '',
      shifts.length === 0 ? 'is-empty' : 'is-filled',
      this.submitted ? 'is-submitted' : 'is-interactive',
    ].filter(Boolean).join(' ');
    cell.dataset.date = dateStr;

    // Date number
    const numEl = document.createElement('div');
    numEl.className = 'cell-num';
    numEl.textContent = day;
    cell.appendChild(numEl);

    // Holiday name
    if (holiday) {
      const hlEl = document.createElement('div');
      hlEl.className = 'cell-holiday-name';
      hlEl.textContent = holiday;
      cell.appendChild(hlEl);
    }

    // Shift chips
    if (shifts.length > 0) {
      const chipsEl = document.createElement('div');
      chipsEl.className = 'cell-chips';
      shifts.forEach(id => {
        const st = this.data.shiftTypes.find(s => s.id === id);
        if (!st) return;
        const chip = document.createElement('span');
        chip.className = 'shift-chip';
        chip.style.backgroundColor = st.color;
        chip.textContent = st.short;
        chipsEl.appendChild(chip);
      });
      cell.appendChild(chipsEl);
    }

    if (!this.submitted) {
      cell.addEventListener('click', () => this._openShiftModal(dateStr));
    }

    return cell;
  }

  _renderActionBar() {
    const confirmBtn = document.getElementById('confirmBtn');

    if (this.submitted) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '提出済み';
    } else {
      const missing = this._getMissingDays();
      confirmBtn.disabled = false;
      if (missing.length === 0) {
        confirmBtn.textContent = '確認・提出 ✓';
        confirmBtn.classList.add('btn-ready');
      } else {
        confirmBtn.textContent = `確認・提出（残 ${missing.length} 日）`;
        confirmBtn.classList.remove('btn-ready');
      }
    }
  }

  _updateProgress() {
    const { year, month } = this.data.targetMonth;
    const total = getDaysInMonth(year, month);
    let filled = 0;
    for (let d = 1; d <= total; d++) {
      const ds = formatDate(new Date(year, month - 1, d));
      if (this.selections[ds] && this.selections[ds].length > 0) filled++;
    }
    const el = document.getElementById('progress');
    if (el) el.textContent = `${filled} / ${total} 日入力済み`;
  }

  // ─── Shift-selection modal ───────────────────────────────────────────────────

  _openShiftModal(dateStr) {
    if (this.submitted) return;
    this.selectedDate = dateStr;
    this.tempSelections = [...(this.selections[dateStr] || [])];

    const date = parseDateStr(dateStr);
    document.getElementById('shiftModalTitle').textContent = formatDateJP(date);

    const body = document.getElementById('shiftModalBody');
    body.innerHTML = '';
    this._cbRefs = [];

    // 2-column grid wrapper
    const grid = document.createElement('div');
    grid.className = 'shift-options-grid';
    body.appendChild(grid);

    this.data.shiftTypes.forEach(st => {
      const label = document.createElement('label');
      label.className = 'shift-option-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = st.id;
      cb.checked = this.tempSelections.includes(st.id);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          this.tempSelections.push(st.id);
        } else {
          this.tempSelections = this.tempSelections.filter(id => id !== st.id);
        }
      });
      this._cbRefs.push(cb);

      const dot = document.createElement('span');
      dot.className = 'shift-dot';
      dot.style.backgroundColor = st.color;

      const info = document.createElement('span');
      info.className = 'shift-info';
      info.innerHTML = `<span class="shift-name">${st.label}</span>`
        + (st.time ? `<span class="shift-time">${st.time}</span>` : '');

      label.appendChild(cb);
      label.appendChild(dot);
      label.appendChild(info);
      grid.appendChild(label); // append to grid, not body
    });

    modal.open('shiftModal');
  }

  _confirmShift() {
    if (!this.selectedDate) return;
    if (this.tempSelections.length === 0) {
      delete this.selections[this.selectedDate];
    } else {
      // Preserve mockData ordering
      const ordered = this.data.shiftTypes
        .map(s => s.id)
        .filter(id => this.tempSelections.includes(id));
      this.selections[this.selectedDate] = ordered;
    }
    this.selectedDate = null;
    this._save();
    modal.close('shiftModal');
    this._renderCalendar();
    this._renderActionBar();
    this._clearMissingHighlight();
  }

  _clearShiftModal() {
    this.tempSelections = [];
    (this._cbRefs || []).forEach(cb => { cb.checked = false; });
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  _getMissingDays() {
    const { year, month } = this.data.targetMonth;
    const total = getDaysInMonth(year, month);
    const missing = [];
    for (let d = 1; d <= total; d++) {
      const ds = formatDate(new Date(year, month - 1, d));
      if (!this.selections[ds] || this.selections[ds].length === 0) missing.push(d);
    }
    return missing;
  }

  _highlightMissing(missingDays) {
    this._clearMissingHighlight();
    const { year, month } = this.data.targetMonth;
    missingDays.forEach(d => {
      const ds = formatDate(new Date(year, month - 1, d));
      const cell = document.querySelector(`[data-date="${ds}"]`);
      if (cell) cell.classList.add('is-missing');
    });
    const first = document.querySelector('.is-missing');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  _clearMissingHighlight() {
    document.querySelectorAll('.is-missing').forEach(el => el.classList.remove('is-missing'));
  }

  // ─── Confirmation modal ──────────────────────────────────────────────────────

  _openConfirmModal() {
    const missing = this._getMissingDays();
    if (missing.length > 0) {
      this._highlightMissing(missing);
      this._showToast(`${missing.length} 日間が未入力です。すべて入力してください。`);
      return;
    }
    this._clearMissingHighlight();
    this._buildConfirmTable();
    document.getElementById('confirmNotes').value = this.notes;

    // Render admin message (each array entry becomes one paragraph)
    const adminEl = document.getElementById('adminMsg');
    adminEl.innerHTML = (this.data.confirmMessage || [])
      .map(line => `<p>${line}</p>`)
      .join('');

    modal.open('confirmModal');
  }

  _buildConfirmTable() {
    const { year, month } = this.data.targetMonth;
    const total = getDaysInMonth(year, month);
    const tbody = document.getElementById('confirmTableBody');
    tbody.innerHTML = '';

    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month - 1, d);
      const ds = formatDate(date);
      const dow = date.getDay();
      const holiday = getHolidayName(ds, this.data.holidays);
      const shifts = this.selections[ds] || [];

      const tr = document.createElement('tr');
      const isRed = dow === 0 || !!holiday;
      if (isRed) tr.className = 'row-sun';
      else if (dow === 6) tr.className = 'row-sat';

      const chipsHtml = shifts.map(id => {
        const st = this.data.shiftTypes.find(s => s.id === id);
        return st
          ? `<span class="confirm-chip" style="background:${st.color}">${st.label}</span>`
          : '';
      }).join('');

      tr.innerHTML = `
        <td>${month}/${d}</td>
        <td>${DAY_NAMES[dow]}${holiday ? `<br><small class="tbl-holiday">${holiday}</small>` : ''}</td>
        <td>${chipsHtml}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  _buildCopyText() {
    const { year, month } = this.data.targetMonth;
    const total = getDaysInMonth(year, month);
    const lines = [
      '【希望シフト提出】',
      `${this.data.project.name}`,
      `${year}年${month}月`,
      `氏名: ${this.data.staff.name}（${this.data.staff.id}）`,
      '',
    ];
    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month - 1, d);
      const ds = formatDate(date);
      const holiday = getHolidayName(ds, this.data.holidays);
      const shifts = (this.selections[ds] || [])
        .map(id => this.data.shiftTypes.find(s => s.id === id)?.label || '')
        .join('/');
      let line = `${month}/${String(d).padStart(2, ' ')} (${DAY_NAMES[date.getDay()]})`;
      if (holiday) line += ` [${holiday}]`;
      line += `\t${shifts}`;
      lines.push(line);
    }
    if (this.notes.trim()) {
      lines.push('', '【特記事項】', this.notes.trim());
    }
    return lines.join('\n');
  }

  async _copyToClipboard() {
    const text = this._buildCopyText();
    const SUCCESS = 'シフト希望内容をコピーしました。ご自身のスマートフォンのメモ帳などに貼り付けて保存してください';

    // Modern Clipboard API (requires HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        this._showToast(SUCCESS, 5000);
        return;
      } catch {
        // fall through to execCommand
      }
    }

    // Fallback: hidden textarea + execCommand (works on HTTP / older browsers)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      const ok = document.execCommand('copy');
      this._showToast(ok ? SUCCESS : 'コピーに失敗しました', ok ? 5000 : 3000);
    } catch {
      this._showToast('コピーに失敗しました');
    } finally {
      document.body.removeChild(ta);
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────

  _submit() {
    this.notes = document.getElementById('confirmNotes').value;
    this.submitted = true;
    this.submittedAt = new Date().toISOString();
    this._save();

    modal.closeAll();

    const timeEl = document.getElementById('successTime');
    if (timeEl) timeEl.textContent = formatDateTimeJP(new Date(this.submittedAt));

    const screen = document.getElementById('successScreen');
    screen.classList.add('active');

    this._render();
  }

  // ─── Toast ───────────────────────────────────────────────────────────────────

  _showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  // ─── Event binding ───────────────────────────────────────────────────────────

  _bindEvents() {
    // Shift modal
    document.getElementById('shiftModalClose').addEventListener('click', () => modal.close('shiftModal'));
    document.getElementById('shiftModalClear').addEventListener('click', () => this._clearShiftModal());
    document.getElementById('shiftModalConfirm').addEventListener('click', () => this._confirmShift());

    // Confirm modal
    document.getElementById('confirmBtn').addEventListener('click', () => this._openConfirmModal());
    const goBackFromConfirm = () => {
      this.notes = document.getElementById('confirmNotes').value;
      modal.close('confirmModal');
    };
    document.getElementById('confirmModalClose').addEventListener('click', goBackFromConfirm);
    document.getElementById('confirmModalBack').addEventListener('click', goBackFromConfirm);
    document.getElementById('copyContentBtn').addEventListener('click', () => this._copyToClipboard());
    document.getElementById('submitBtn').addEventListener('click', () => this._submit());
    document.getElementById('confirmNotes').addEventListener('input', e => {
      this.notes = e.target.value;
    });

    // Success screen
    document.getElementById('successClose').addEventListener('click', () => {
      document.getElementById('successScreen').classList.remove('active');
    });

    // Clear all data — two-tap pattern (no confirm dialog, works in all browsers)
    document.getElementById('clearBtn').addEventListener('click', () => {
      const btn = document.getElementById('clearBtn');
      if (this._clearArmed) {
        clearTimeout(this._clearTimer);
        StorageManager.clear();
        location.reload();
        return;
      }
      this._clearArmed = true;
      btn.textContent = 'もう一度タップ';
      btn.classList.add('btn-clear--armed');
      this._clearTimer = setTimeout(() => {
        this._clearArmed = false;
        btn.textContent = 'クリア';
        btn.classList.remove('btn-clear--armed');
      }, 3000);
    });

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) modal.close(overlay.id);
      });
    });

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') modal.closeAll();
    });

    // Recalculate layout on orientation change / resize
    window.addEventListener('resize', () => this._adjustLayout());
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  new CalendarApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('[SW] registration failed:', err);
    });
  }
});
