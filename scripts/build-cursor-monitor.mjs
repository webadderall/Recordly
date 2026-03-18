import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'electron', 'native', 'cursor-monitor');
const buildDir = path.join(sourceDir, 'build');

if (process.platform !== 'win32') {
  console.log('[build-cursor-monitor] Skipping: host platform is not Windows.');
  process.exit(0);
}

if (!existsSync(path.join(sourceDir, 'CMakeLists.txt'))) {
  console.error('[build-cursor-monitor] CMakeLists.txt not found at', sourceDir);
  process.exit(1);
}

function findCmake() {
  // Check PATH first (your standalone CMake)
  try {
    execSync('cmake --version', { stdio: 'pipe' });
    return 'cmake';
  } catch {
    // not on PATH
  }

  // Look for bundled CMake in Visual Studio (prefer 2026)
  const vsYears = ['2026', '2022'];
  const vsEditions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];

  for (const year of vsYears) {
    for (const edition of vsEditions) {
      const cmakePath = path.join(
        'D:',                          // ← changed to D: because that's where your VS is
        'Program Files',
        'Microsoft Visual Studio',
        year,
        edition,
        'Common7',
        'IDE',
        'CommonExtensions',
        'Microsoft',
        'CMake',
        'CMake',
        'bin',
        'cmake.exe'
      );
      if (existsSync(cmakePath)) {
        console.log(`[build-cursor-monitor] Found CMake at: ${cmakePath}`);
        return `"${cmakePath}"`;
      }
    }
  }

  return null;
}

const cmake = findCmake();

if (!cmake) {
  console.error(
    '[build-cursor-monitor] CMake not found.\n' +
    'Make sure you have:\n' +
    '  - Standalone CMake installed and in PATH, or\n' +
    '  - Visual Studio 2026 with "Desktop development with C++" workload and "C++ CMake tools for Windows" component.'
  );
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });

console.log('[build-cursor-monitor] Configuring CMake with Visual Studio 18 2026...');

try {
  execSync(`${cmake} .. -G "Visual Studio 18 2026" -A x64`, {
    cwd: buildDir,
    stdio: 'inherit',
    timeout: 120000,
  });
} catch (error) {
  console.error('[build-cursor-monitor] CMake configure failed with VS 2026:');
  console.error(error.message || error);
  console.log(
    '\nQuick fixes:\n' +
    '1. Delete the build folder: electron\\native\\cursor-monitor\\build\n' +
    '2. Make sure VS 2026 has "C++ CMake tools for Windows" installed\n' +
    '3. Run manually: cmake .. -G "Visual Studio 18 2026" -A x64  (from inside build folder)'
  );
  process.exit(1);
}

console.log('[build-cursor-monitor] Building cursor-monitor (Release)...');

try {
  execSync(`${cmake} --build . --config Release`, {
    cwd: buildDir,
    stdio: 'inherit',
    timeout: 300000,
  });
} catch (error) {
  console.error('[build-cursor-monitor] Build failed:');
  console.error(error.message || error);
  process.exit(1);
}

const exePath = path.join(buildDir, 'Release', 'cursor-monitor.exe');

if (existsSync(exePath)) {
  console.log(`[build-cursor-monitor] Built successfully: ${exePath}`);
} else {
  console.error('[build-cursor-monitor] Expected executable not found at', exePath);
  process.exit(1);
}