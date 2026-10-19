import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function SubdomainTakeovers(details: ProjectDetails) {
  return <AttackButton details={details} channel="subdomain-takeovers" idleLabel="Run scan" />;
}
