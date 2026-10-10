// Self-hosted fonts (ADR 0002). Bundled by Vite and served from 'self';
// the CSP forbids third-party font hosts.
// Subsets: Latin (+ Latin Extended for names with diacritics) and Ethiopic
// (Amharic names and labels). Nothing else is shipped.
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-500.css';
import '@fontsource/ibm-plex-sans/latin-ext-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/noto-serif/latin-400.css';
import '@fontsource/noto-serif/latin-600.css';
import '@fontsource/noto-serif/latin-ext-400.css';
import '@fontsource/noto-serif/latin-ext-600.css';
import '@fontsource/noto-serif-ethiopic/ethiopic-400.css';
import '@fontsource/noto-serif-ethiopic/ethiopic-600.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
