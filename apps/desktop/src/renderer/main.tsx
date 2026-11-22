// Placeholder. T4 (screens) replaces this with the app (Home, Session, Setup).
import { createRoot } from 'react-dom/client';
import './tokens.css';
import { t } from '../shared/copy';

createRoot(document.getElementById('root')!).render(<h1>{t('home.title')}</h1>);
