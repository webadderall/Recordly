import { execSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, 'electron', 'native', 'windows-capture');
const buildDir = path.join(sourceDir, 'build');

if (process.platform !== 'win32') {
  console.log('[build-windows-capture] Skipping native Windows capture build: host platform is not Windows.');
  process.exit(0);
}

if (!existsSync(path.join(sourceDir, 'CMakeLists.txt'))) {
  console.error('[build-windows-capture] CMakeLists.txt not found at', sourceDir);
  process.exit(1);
}

function findCmake() {
  // Check PATH first (most common when CMake is installed standalone)
  try {
    execSync('cmake --version', { stdio: 'pipe' });
    return 'cmake';
  } catch {
    // not on PATH
  }

  // Look for bundled CMake in Visual Studio installations
  const vsYears = ['2026', '2022']; // Prefer 2026, fallback to 2022 if needed
  const vsEditions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];

  for (const year of vsYears) {
    for (const edition of vsEditions) {
      const cmakePath = path.join(
        'C:', 'Program Files', 'Microsoft Visual Studio', year, edition,
        'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake', 'CMake', 'bin', 'cmake.exe'
      );
      if (existsSync(cmakePath)) {
        console.log(`[build-windows-capture] Found CMake at: ${cmakePath}`);
        return `"${cmakePath}"`;
      }
    }
  }

  return null;
}

const cmake = findCmake();

if (!cmake) {
  console.error(
    '[build-windows-capture] CMake not found.\n' +
    'Please install Visual Studio 2026 (with "Desktop development with C++" workload and "C++ CMake tools for Windows" component)\n' +
    'or install standalone CMake and add it to PATH.'
  );
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });

console.log('[build-windows-capture] Configuring CMake with Visual Studio 18 2026...');

try {
  execSync(`${cmake} .. -G "Visual Studio 18 2026" -A x64`, {
    cwd: buildDir,
    stdio: 'inherit',
    timeout: 120000,
  });
} catch (error) {
  console.error('[build-windows-capture] CMake configure failed with VS 2026:');
  console.error(error.message || error);
  console.log(
    '\nPossible fixes:\n' +
    '1. Make sure Visual Studio 2026 has "Desktop development with C++" workload installed.\n' +
    '2. Check "C++ CMake tools for Windows" component is installed.\n' +
    '3. Delete the build folder and retry.\n' +
    '4. Run "cmake .. -G \'Visual Studio 18 2026\' -A x64" manually in the native folder to debug.'
  );
  process.exit(1);
}

console.log('[build-windows-capture] Building native Windows capture helper (Release)...');

try {
  execSync(`${cmake} --build . --config Release`, {
    cwd: buildDir,
    stdio: 'inherit',
    timeout: 300000,
  });
} catch (error) {
  console.error('[build-windows-capture] Build failed:');
  console.error(error.message || error);
  process.exit(1);
}

const exePath = path.join(buildDir, 'Release', 'windows-capture.exe');

if (existsSync(exePath)) {
  console.log(`[build-windows-capture] Built successfully: ${exePath}`);
} else {
  console.error('[build-windows-capture] Expected executable not found at', exePath);
  process.exit(1);
}