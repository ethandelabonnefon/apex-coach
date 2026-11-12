/**
 * Accueil = la page Suivi.
 *
 * Depuis le retrait des modules sport et nutrition (nov. 2026), l'app n'a
 * plus qu'un sujet : le diabète. L'ancien tableau de bord « Overview »
 * n'était plus qu'un écran de passage vers /diabete. On rend donc
 * directement la page Suivi ici, plutôt qu'une redirection : l'app
 * installée sur l'écran d'accueil démarre sur « / », et elle doit s'ouvrir
 * sans aller-retour réseau, y compris hors connexion.
 */
export { default } from "./diabete/page";
