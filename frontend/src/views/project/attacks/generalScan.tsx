import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function GeneralScan(details: ProjectDetails) {
  return <AttackButton details={details} channel="general-scan" idleLabel="Run scan" />;
}
