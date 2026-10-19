import { useParams } from 'react-router-dom';

export function ScreenResults() {
  const { projectSlug } = useParams();
  const src = `/project-files/${encodeURIComponent(projectSlug || '')}/httpx_screen/screenshot/screenshot.html`;
  return (
    <iframe
      title="HunterKit screenshots"
      src={src}
      className="w-full min-h-[70vh] rounded-md border border-gray-500/20 bg-white"
    />
  );
}
