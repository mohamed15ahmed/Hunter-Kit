import { ProjectDetails } from '../../../types';
import AttackButton from './AttackButton';

export default function Lfi(details: ProjectDetails) {
  return <AttackButton details={details} channel="lfi" idleLabel="Run scan" />;
}
