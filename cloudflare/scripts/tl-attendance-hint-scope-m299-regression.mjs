import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const client=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

assert(index.includes('tl-attendance-hint-scope-m299=1'),'M2.9.9 cache marker is present');
const start=client.indexOf('function attendanceHintAllowedForCurrentViewer(key)');
const end=client.indexOf('function recentAgentAttendanceHint(key)',start);
assert(start>=0&&end>start,'attendance hint scope filter exists');
const source=client.slice(start,end);
assert(source.includes('if (isAdmin) return true;'),'Admin retains all-POD invalidation scope');
assert(source.includes('if (isTeamLeader)'),'Team Leader gets explicit pre-request scope filtering');
assert(source.includes("target.family === 'team_leader'"),'TL own Team Leader attendance record is handled explicitly');
assert(source.includes('targetPod === activePod'),'TL Agent hints are restricted to the active authorized POD');
assert(source.indexOf('if (isTeamLeader)') < source.indexOf('regularAgentAttendanceSessionActive'),'TL filtering runs before regular-Agent fallback');

function compile(env){
  const fn=vm.runInNewContext(`(function(){
    let isAdmin=${env.isAdmin?'true':'false'};
    let isTeamLeader=${env.isTeamLeader?'true':'false'};
    let teamLeaderName=${JSON.stringify(env.teamLeaderName||'')};
    let lockedPod=${JSON.stringify(env.lockedPod||'')};
    let TEAM_LEADER_POD_BY_NAME=${JSON.stringify(env.tlMap||{})};
    let agentSessionAuthenticated=${env.agentSessionAuthenticated?'true':'false'};
    let agentSessionName=${JSON.stringify(env.agentSessionName||'')};
    let agentSessionPod=${JSON.stringify(env.agentSessionPod||'')};
    const pods=${JSON.stringify(env.pods||{})};
    function podOf(name){return pods[name]||'';}
    function attendanceAuthorityTarget(key){
      const raw=String(key||''); const prefix=raw.startsWith('att:')?'att:':raw.startsWith('tlatt:')?'tlatt:':'';
      if(!prefix)return null; const body=raw.slice(prefix.length),split=body.indexOf('|');
      if(split<=0||split>=body.length-1)return null;
      return {family:prefix==='att:'?'agent':'team_leader',date:body.slice(0,split),name:body.slice(split+1)};
    }
    function regularAgentAttendanceSessionActive(){return Boolean(agentSessionAuthenticated&&!isAdmin&&!isTeamLeader&&agentSessionName);}
    function currentAgentAttendancePod(){return String(lockedPod||agentSessionPod||podOf(agentSessionName||'')||'').trim();}
    ${source}
    return attendanceHintAllowedForCurrentViewer;
  })()`);
  return fn;
}

const tl=compile({isTeamLeader:true,teamLeaderName:'TL One',lockedPod:'POD 2',tlMap:{'TL One':'POD 2'},pods:{'Agent A':'POD 2','Agent B':'POD 3'}});
assert.equal(tl('att:2026-10-07|Agent A'),true,'TL may refresh own active POD Agent');
assert.equal(tl('att:2026-10-07|Agent B'),false,'TL must suppress out-of-POD Agent invalidation before HTTP request');
assert.equal(tl('tlatt:2026-10-07|TL One'),true,'TL may refresh own TL attendance');
assert.equal(tl('tlatt:2026-10-07|TL Two'),false,'TL must suppress another TL attendance invalidation');
const backup=compile({isTeamLeader:true,teamLeaderName:'TL One',lockedPod:'POD 3',tlMap:{'TL One':'POD 2'},pods:{'Agent A':'POD 2','Agent B':'POD 3'}});
assert.equal(backup('att:2026-10-07|Agent B'),true,'active Backup-TL POD follows lockedPod');
assert.equal(backup('att:2026-10-07|Agent A'),false,'while delegated, stale home-POD hints are not fetched as active-POD reads');
const admin=compile({isAdmin:true,pods:{'Agent A':'POD 2','Agent B':'POD 3'}});
assert.equal(admin('att:2026-10-07|Agent B'),true,'Admin retains all-POD scope');

console.log('PASS M2.9.9 TL Attendance hint scope: out-of-POD Firebase invalidations are filtered before secure record GETs, Admin remains all-POD, and active Backup-TL POD follows lockedPod.');
