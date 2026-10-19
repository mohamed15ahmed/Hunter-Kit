import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function ExposedPanels(details: ProjectDetails) {
  return <AttackButton details={details} channel="exposed-panels" idleLabel="Run scan" />;
}
