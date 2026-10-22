import './fonts.js';
import { findTask } from '../tasks/registry.js';
import type { OsMode } from '../shell/modes.js';
import { mountTaskScreen } from './screens/task.js';
import { startStudentApp } from './student.js';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const previewId = params.get('task');

if (previewId) {
  // Preview mode: open a task directly, no server and no admin.
  const def = findTask(previewId);
  const os = params.get('os');
  const mode: OsMode = os === 'linux' || os === 'windows' ? os : 'mac';
  if (def) mountTaskScreen(app, { def, mode });
  else app.textContent = `Fant ikke oppgaven «${previewId}».`;
} else {
  startStudentApp(app);
}
