// C1 Home: H1, repo chip, composer pill. Not a Git repo → inline error and the composer stays disabled (AC-F1b).
import { t } from '../../shared/copy';
import { useApp } from '../store/appStore';
import { RepoChip } from '../components/RepoChip';
import { HomeComposer } from '../components/HomeComposer';
import { TopBar } from '../components/TopBar';
import './home.css';

export function Home() {
  const repo = useApp((s) => s.repo);
  const ready = useApp((s) => s.setup?.canStart === true);
  const notGit = repo !== null && !repo.isGitRepo;
  return (
    <main className="o-main">
      <TopBar />
      <div className="o-home">
        <div className="o-home-col">
          <h1 className="o-h1">{t('home.title')}</h1>
          <div className="o-home-repo"><RepoChip /></div>
          <HomeComposer enabled={ready && repo !== null && repo.isGitRepo} />
          {notGit ? <p className="o-home-err" role="alert">{t('home.repo.notGit')}</p> : null}
        </div>
      </div>
    </main>
  );
}
