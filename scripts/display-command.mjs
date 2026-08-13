const [command = 'help', ...args] = process.argv.slice(2);
const widgetAliases = { weather: 'weather.weekly', calendar: 'calendar.agenda', tasks: 'tasks.list', clock: 'clock' };
const commandId = () => crypto.randomUUID();
const widget = (name, index = 0) => ({ id: `${name}-${index + 1}`, type: widgetAliases[name] });

function usage(exitCode = 0) {
  console.log('Usage: npm run display:command -- canvas <widget...>');
  console.log('       npm run display:command -- focus <weather|calendar|tasks|clock> [seconds]');
  console.log('       npm run display:command -- pin | cycle [seconds] | next | previous | clear-focus | home');
  process.exit(exitCode);
}

if (command === 'help') usage();
let payload;
if (command === 'canvas') {
  if (!args.length || args.some(name => !widgetAliases[name])) usage(1);
  payload = { schema_version: 1, command_id: commandId(), action: 'display.canvas.set', canvas: { widgets: args.map(widget), pagination: { mode: 'cycle', interval_seconds: 15 } } };
} else if (command === 'focus') {
  if (!widgetAliases[args[0]]) usage(1);
  payload = { schema_version: 1, command_id: commandId(), action: 'display.focus.set', widget: { ...widget(args[0]), preferred_variant: 'focus' }, behavior: { duration_seconds: Number(args[1] || 60), revert_to: 'canvas', transition: 'fade' } };
} else if (command === 'pin') {
  payload = { schema_version: 1, command_id: commandId(), action: 'display.page.pin', pagination: { mode: 'pinned' } };
} else if (command === 'cycle') {
  payload = { schema_version: 1, command_id: commandId(), action: 'display.page.cycle', pagination: { mode: 'cycle', interval_seconds: Number(args[0] || 15) } };
} else if (['next', 'previous'].includes(command)) {
  payload = { schema_version: 1, command_id: commandId(), action: `display.page.${command}` };
} else if (command === 'clear-focus') {
  payload = { schema_version: 1, command_id: commandId(), action: 'display.focus.clear' };
} else if (command === 'home') {
  payload = { schema_version: 1, command_id: commandId(), action: 'display.scene.home' };
} else usage(1);

const response = await fetch('http://127.0.0.1:4173/api/display/commands', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok) process.exit(1);
