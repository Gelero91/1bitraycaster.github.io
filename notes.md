    /* 
        Notes études fonction bitwise :
            x | 0      →  équivalent à Math.trunc(x), convertit en int 32 bits
            x >> n     →  divise x par 2^n  (ex: x >> 1 = x / 2)
            x << n     →  multiplie x par 2^n  (ex: x << 1 = x * 2)

            Note : ">>" et "<<" ne fonctionnent que pour des puissances de 2 (2, 4, 8, 16...)
            Note : On peut également stocker des booléens dans une chaîne de bits (flags)
    */

    // implémenter mur horizontaux plus sombre pour effet profondeur - envisager règle style shadee -1
    // déja fait on dirait



    // TO DO

RAYCAST “the dithering”


Ajouter fonctionnalités:
portes “ken’s layrinth”
retirer le coulissement des portes
escalier “ken’s layrinth”
½ murs, comme pour les portes, mais pour avoir une orientation/perspective 
pas de billboard sprite
étages (sans plafond)
skybox
murs transparents traversables (exemple : arches, poutres..)

Fait :
x Amélioration du ZBuffer pour l'occlusion des sprites, indexé sur X pour un rendu exact
x Fusion DDA/porte, correction du jambage et occlusion des sprites derrière les portes
X tri rendu des sprites

AUTRES IMPORTANTS :
Créer ce putain d’éditeur de carte sérieux 
pas de procédural c’est à chier.
Créer petite doc pour expliquer le fonctionnement du moteur
