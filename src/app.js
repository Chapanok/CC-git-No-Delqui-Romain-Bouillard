/*  ============================================================
    Mini project for Git conflict practice (pair work)
    ------------------------------------------------------------
    Both teammates MUST edit THE SAME LINE below (AUTHOR_NAME)
    on separate branches to provoke a merge conflict.
    ============================================================ */

const PROJECT_NAME = "git-collab-mini";

// ★ À MODIFIER PAR LES DEUX (VALEUR DIFFÉRENTE OBLIGATOIRE)
const AUTHOR_NAME = "CHANGE_ME";

function buildBanner() {
	return `[${PROJECT_NAME}] by ${AUTHOR_NAME}`;
}

function main() {
	console.log(buildBanner());
}

main();
