import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function SqlInjection(details: ProjectDetails) {
  return <AttackButton details={details} channel="multi-scans" idleLabel="Run DAST scan" />;
}
