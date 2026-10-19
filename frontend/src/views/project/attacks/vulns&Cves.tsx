import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function VulnsCves(details: ProjectDetails) {
  return <AttackButton details={details} channel="vulns-cves" idleLabel="Run scan" />;
}
