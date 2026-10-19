import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function PotentialXss(details: ProjectDetails) {
  return <AttackButton details={details} channel="potential-xss" idleLabel="Run verification" />;
}
