import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function Exposures(details: ProjectDetails) {
  return <AttackButton details={details} channel="exposures" idleLabel="Run scan" />;
}
