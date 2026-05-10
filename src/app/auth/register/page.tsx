import { redirect } from 'next/navigation';

/**
 * The minimal /auth/register form has been retired in favour of the full
 * Staff Onboarding form at /onboarding, which collects all the details the
 * ORM administrator needs (title, role, department, staff code, staff ID,
 * contract-staff flag, House Officer rotation, etc.) and matches the look
 * and feel of the rest of the application.
 *
 * Anyone who lands on /auth/register (e.g. from the "Don't have an account?
 * Register here" link on the login page) is forwarded server-side to the
 * canonical onboarding form so there is only one place where staff sign up.
 */
export default function RegisterRedirectPage() {
  redirect('/onboarding');
}
