import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(root, 'public/assets/js/j-b52f8ff97ca5.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/assets/css/c-agent-password-recovery.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');

const checks = [
  ['server stores reset requests without changing credentials', worker.includes('handleSecurityCredentialRequestReset') && worker.includes('passwordResetRequests') && worker.includes('Recovery requests never change a credential or return a reset secret')],
  ['TL credential list remains server scoped', worker.includes("if(!admin&&(role!=='agent'||String(member.pod||'')!==String(actor.pod||'')))continue")],
  ['TL-only notification scope is enforced', js.includes("if (!(isTeamLeader && !isAdmin && teamLeaderName && lockedPod)) return []")],
  ['reset request cache is replaced, not merged across role/POD transitions', js.includes('agentPasswordResetRequests.clear();') && js.includes('agentPasswordResetRequestPods.clear();')],
  ['pending reset requests carry server-returned POD metadata', js.includes("agentPasswordResetRequestPods.set(row.name, String(row.pod || ''))")],
  ['new unseen requests surface a TL toast', js.includes('maybeShowTeamLeaderPasswordResetToast') && js.includes('requested a password reset. Open Notifications to review.')],
  ['bell unread count includes password reset requests', js.includes('leaveV2UnreadNotificationCount() + teamLeaderUnreadPasswordResetCount()')],
  ['notification center renders a dedicated password reset section', js.includes('Password Reset Requests') && js.includes('data-tl-password-reset-review')],
  ['review action focuses Agent Account Security', js.includes('focusTeamLeaderPasswordResetRequest') && js.includes("$('agentSecurityPanel')") && js.includes('scheduleAgentSecurityPanelRender();')],
  ['opening notifications refreshes secure reset state', js.includes('await refreshCredentialSecurityStateCache(true)')],
  ['opening Notifications marks reset alerts seen without resolving them', js.includes('markTeamLeaderPasswordResetNotificationsSeen();')],
  ['notification UI has light/dark/responsive styling', css.includes('.tl-password-reset-notification-section') && css.includes('body.dark-mode .tl-password-reset-notification-section') && css.includes('@media(max-width:560px)')],
  ['password recovery CSS cache bust advanced', html.includes('c-agent-password-recovery.css?v=203-recovery2')],
  ['main app JS cache bust includes M2.9.17 reset alert marker', html.includes('tl-reset-notify-m2917=1')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS: ${name}`);
  else { console.error(`FAIL: ${name}`); failed++; }
}
if (failed) process.exit(1);
console.log(`PASS: M2.9.17 TL password reset notification regression (${checks.length}/${checks.length})`);
