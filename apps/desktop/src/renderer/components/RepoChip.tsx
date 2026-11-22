// Repo chip (C1, J10): folder name with ellipsis at the name column, full path as tooltip. Click to pick or change.
import { t } from '../../shared/copy';
import { useApp } from '../store/appStore';
import { folderName } from '../store/merge';
import { Icon } from './Icon';

export function RepoChip({ disabled }: { disabled?: boolean }) {
  const repo = useApp((s) => s.repo);
  const pickRepo = useApp((s) => s.pickRepo);
  const name = repo ? repo.name || folderName(repo.path) : t('home.repo.pick');
  return (
    <button
      type="button"
      className={`o-repo-chip${repo && !repo.isGitRepo ? ' is-bad' : ''}`}
      data-testid="repo-chip"
      title={repo ? `${name}\n${repo.path}` : t('home.repo.pick')}
      aria-label={repo ? `${t('home.repo.change')}: ${name}` : t('home.repo.pick')}
      onClick={() => void pickRepo()}
      disabled={disabled}
    >
      <Icon name="folder" />
      <span className="o-repo-name o-ellipsis" data-truncate="">{name}</span>
      <Icon name="chevd" />
    </button>
  );
}
