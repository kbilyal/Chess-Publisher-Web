from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/companion/CompanionWorkspace.tsx'
source = path.read_text(encoding='utf-8')
old = '''            <section className="companion-sync-card">
              <div><Smartphone size={20} /><span><strong>One tournament, explicit direction</strong><small>Pull = Cloud → Web only. Push = Web → Cloud only. Neither command silently reverses direction.</small></span></div>
              <button type="button" className="companion-button secondary" onClick={pullDesktopChanges} disabled={busy !== null || cloud.busy}><RefreshCw size={16} /> Pull latest Cloud → Web</button>
            </section>
'''
new = '''            <section className="companion-sync-card" data-unified-sync-status="true">
              <div><Smartphone size={20} /><span><strong>Unified ↕ SYNC</strong><small>One safe action: no-op when equal, pull Cloud-only changes, push Web-only changes, and stop on a true two-sided conflict.</small></span></div>
              <button type="button" className="companion-button primary" onClick={unifiedSync} disabled={busy !== null || cloud.busy}><Cloud size={16} /> {busy === 'sync' ? '↕ SYNC…' : '↕ SYNC'}</button>
            </section>
'''
count = source.count(old)
if count != 1:
    raise SystemExit(f'legacy Organizer directional sync card anchor mismatch: expected 1, found {count}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Removed final legacy directional Organizer sync action.')
