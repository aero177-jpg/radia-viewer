/**
 * Landing title card overlay for loading assets.
 * Sits above the app layout and handles file/storage/demo actions.
 */
import { useEffect, useState } from 'preact/hooks';
import FrostedTitle from './FrostedTitle';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faCloud, faRocket, faUpload } from '@fortawesome/free-solid-svg-icons';
import { testSharpCloud } from '../testSharpCloud';
import { FolderIcon, ServerIcon, RocketIcon } from '../icons/customIcons';

function TitleCard({
  show,
  onPickFile,
  onOpenStorage,
  onLoadDemo,
}) {
  // Keep the overlay mounted through fade-out; unmount after transition ends
  const [mounted, setMounted] = useState(show);

  // Responsive mask height (tight mask on narrow screens)
  const [maskHeight, setMaskHeight] = useState(() => {
    if (typeof window === 'undefined') return 150;
    return window.innerWidth <= 500 ? 80 : 150;
  });

  // Button entrance visibility
  const [buttonsVisible, setButtonsVisible] = useState(false);

  const handleTestCloudUpload = () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = 'image/*';
    picker.onchange = (event) => {
      const selectedFiles = event?.target?.files;
      if (selectedFiles && selectedFiles.length > 0) {
        testSharpCloud(selectedFiles);
      }
      picker.remove();
    };
    picker.click();
  };

  useEffect(() => {
    let unmountTimer;
    if (show) {
      setMounted(true);
    } else {
      unmountTimer = setTimeout(() => setMounted(false), 450);
    }
    return () => {
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [show]);

  useEffect(() => {
    if (!show) {
      setButtonsVisible(false);
      return undefined;
    }
    const resizeHandler = () => {
      setMaskHeight(window.innerWidth <= 500 ? 80 : 180);
    };
    resizeHandler();
    window.addEventListener('resize', resizeHandler);

    const timer = setTimeout(() => setButtonsVisible(true), 1000);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resizeHandler);
    };
  }, [show]);

  const actionButtonsClass = `action-buttons ${buttonsVisible ? 'is-visible' : ''}`;

  // Render always and let parent control visibility via CSS class to allow fade transitions
  const overlayClass = `title-card-overlay ${show ? 'is-visible' : 'is-hidden'}`;

  if (!mounted) return null;

  return (
    <div class={overlayClass} inert={!show ? '' : undefined}>
      <div class="title-card">
        <FrostedTitle
          backgroundImage="/neonstaticblur.jpg"
          title="Radia"
          height={520}
          maskHeight={maskHeight}
          animation="rotate"
          showStroke
        />
        <div class="title-card__content">
          <div class={actionButtonsClass}>
            <button class="action-btn " onClick={onPickFile}>
              <FolderIcon size={16} />
              <span>B r o w s e </span>
            </button>
            <button class="action-btn " onClick={onOpenStorage}>
              <ServerIcon size={16} />
              <span>C o n n e c t</span>
            </button>
            {/* <button class="action-btn cloud-test" onClick={handleTestCloudUpload}>
              <FontAwesomeIcon icon={faUpload} />
              <span>Test Cloud Upload</span>
            </button> */}
            <button class="action-btn " onClick={onLoadDemo}>
              <RocketIcon size={16} />
              <span>D e m o</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TitleCard;
