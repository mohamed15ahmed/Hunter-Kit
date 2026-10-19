import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function DefaultCredentials(details: ProjectDetails) {
  return <AttackButton details={details} channel="default-credentials" idleLabel="Run scan" />;
}
