/* Streak presentation helpers. No writes, requests, timers or private global state. */
(function (global) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    function dateLabel(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return '';
        const date = new Date(value + 'T12:00:00+08:00');
        return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en', {weekday:'long',month:'short',day:'numeric',timeZone:'Asia/Manila'}).format(date) : '';
    }
    function guidance(data) {
        const pending = count(data.pendingCount);
        const next = dateLabel(data.nextWorkday?.date);
        const adjustment = data.lastAdjustment;
        const changed = Array.isArray(adjustment?.changes) ? adjustment.changes : [];
        return `<div class="tt-streak-guidance">
            ${pending ? `<div class="tt-streak-pending" role="status"><strong>Pending verification · ${pending} ${pending===1?'day':'days'}</strong><p>Unverified days do not reset your streak or earn rewards. ${data.streakHeld?'Earlier momentum is held during review; a new verified run can still grow. ':''}Ask your Admin or Team Leader to review missing punches or corrections.</p></div>` : ''}
            <div class="tt-streak-next"><span class="tt-achievement-eyebrow">WHAT HAPPENS NEXT</span><strong>${next ? `Next qualifying workday: ${escape(next)}` : 'No qualifying workday found in the next 62 days'}</strong><p>Based on your current schedule and approved full-day leave · Asia/Manila. Check My Schedule for shift hours. A day counts after its attendance is verified.</p></div>
            ${changed.length ? `<details class="tt-streak-adjustment"><summary>${adjustment.restored?'Streak restored after attendance review':'Attendance calculation updated'}</summary><p>Last reviewed calculation: ${count(adjustment.previousStreak)} → ${count(adjustment.currentStreak)} days. Permanent achievements remain earned.</p><ul>${changed.map(row=>`<li>${escape(row.date)} · ${escape(row.reason)}</li>`).join('')}</ul></details>` : ''}
        </div>`;
    }
    global.TrinoTimeStreakExperience = Object.freeze({guidance,dateLabel});
})(window);
