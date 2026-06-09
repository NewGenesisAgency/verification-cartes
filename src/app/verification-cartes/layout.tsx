import AuthGate from '../components/AuthGate';

/**
 * Toutes les pages sous /verification-cartes (scanner + historique) exigent
 * une session agent MDL.
 */
export default function VerificationCartesLayout({ children }: { children: React.ReactNode }) {
    return <AuthGate>{children}</AuthGate>;
}
