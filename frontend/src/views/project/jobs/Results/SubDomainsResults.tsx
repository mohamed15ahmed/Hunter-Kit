import { useNavigate } from 'react-router-dom';
import * as button from '../../../../components/ui/button';

export default function SubDomainsResults() {
  const navigate = useNavigate();
  return <button.Button onClick={() => navigate('../result-recon')}>Find</button.Button>;
}
