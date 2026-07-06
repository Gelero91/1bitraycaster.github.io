///////////////////////////////////////////////////////////////////////
// 0 - Globals
///////////////////////////////////////////////////////////////////////

// requis pour appeler à interval régulier la fonction gameloop()
// On divise 1000 (milisecondes) par les FPS désirés
const DESIRED_FPS = 60;
const UPDATE_INTERVAL = Math.trunc(1000 / DESIRED_FPS);
let stopTheLoop = false;

// affichage des fps (pas mon code)
let lastFrameTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

// variable pour calcul raycasting/sprite/sol/plafond
let playerTileX;
let playerTileY;

// Calcul des vecteurs caméra (une seule fois par frame)
let dirX;
let dirY;

// 0.414 = Math.tan(playerFOV / 2)
let planeX;
let planeY;

// garder proportion 3:5 (ex : 60x100)
const renderScreenHeight = 120;
const renderScreenWidth = 200;

const canvasElement = document.getElementById('htmlRenderScreen');
const ctx = canvasElement.getContext('2d');

// dangereux, problème d'échelle
const scale = 4;
canvasElement.width  = renderScreenWidth  * scale;
canvasElement.height = renderScreenHeight * scale;
    
// inutile avec le mode canvas
//const doubleRenderScreenHeight = renderScreenHeight * 1;
//const doubleRenderScreenWidth = renderScreenWidth * 1;

// on sépare les données du buffer avec le rendu final (passé au Dithering)
const htmlRenderScreen = document.getElementById('htmlRenderScreen');

// définir le buffer de rendu des caractères
let renderBuffer = [];

let doorRenderBuffer = [];
doorRenderBuffer = new Array(renderScreenWidth * renderScreenHeight).fill(-1);

// on type le ZBuffer en liste (la position permet de déduire la valeur de X/la colonne)
ZBuffer = new Array(renderScreenWidth).fill(Infinity);

// buffer Sol/plafond
// utilise des "Float32Array plutôt que tableau JS : plus rapide, initialisé à 0 automatiquement."
// voir si on peut les réduires en 8Array
let wallHitX = new Float32Array(renderScreenWidth); // coordonnée monde X du mur touché
let wallHitY = new Float32Array(renderScreenWidth); // coordonnée monde Y du mur touché
let wallDist = new Float32Array(renderScreenWidth); // distance au mur (copie du ZBuffer)

// permet de doubler la résolution pour les matrices 2x2
let ditherBuffer = []
const ditherBufferWidth = renderScreenWidth * 2;
const ditherBufferHeight = renderScreenHeight * 2;

const imageData = ctx.createImageData(canvasElement.width, canvasElement.height);
const pixels    = imageData.data; // Uint8ClampedArray

// Des décimales fixes semblent suffire
const PI   =  3.1415 ;
const PIx2 =  PI * 2 ;

///////////////////////////////////////////////////////////////////////
// 1 - Player Vars
///////////////////////////////////////////////////////////////////////

// Distance max du rayon
const maxRayDepth = 16;

// FOV = pi / 4 (radiants), soit 45°
const playerFOV = PI / 4;

// vitesse du joueur
const playerStepRate = 0.2;
const playerRotRate = 0.04;

// position de départ
let playerPosX = 3;
let playerPosY = 3;
let playerAngle= 0;

// bloque les actions entre chaque gameloop
let playerActionDone;

// test : on garde en mémoire la position suivante pour vérification blocage dans gameloop
let nextPlayerPosX  = playerPosX ;
let nextPlayerPosY  = playerPosY ;
let nextPlayerAngle = playerAngle;

///////////////////////////////////////////////////////////////////////
// 2 - Map
///////////////////////////////////////////////////////////////////////

const mapHeight = 16;
const mapWidth = 16;

// les comparaisons de chaine de caractères sont plus lentes, donc tout transformer en constantes
const VERTICAL = 1;
const HORIZONTAL = 2;

// utiliser des bits plutôt que ce int
const NORTH = 1;
const SOUTH = 2;
const EAST  = 3;
const WEST  = 4;

const wall = '#';
const empty = ',';
const door  = 'D'; // porte dans un couloir nord/sud (traversée sur X)
const doorV = 'V'; // porte dans un couloir est/ouest (traversée sur Y)

const DOOR_SPEED = 0.025; // vitesse d'ouverture (fraction de tuile par frame)

// État de chaque porte, indexé par position dans la map (mapY * mapWidth + mapX)
const doors = {};

function initDoors() {
    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            const tile = map[y * mapWidth + x];
            if (tile === door || tile === doorV) {
                doors[y * mapWidth + x] = { open: 0, opening: false, closing: false };
            }
        }
    }
};

function updateDoors() {
    for (const key in doors) {
        const d = doors[key];
        if (d.opening) {
            d.open = Math.min(1, d.open + DOOR_SPEED);
            if (d.open >= 1) d.opening = false;
        }
        if (d.closing) {
            d.open = Math.max(0, d.open - DOOR_SPEED);
            if (d.open <= 0) d.closing = false;
        }
    }
}

///////////////////////////////////////////////////////////////////////
// 3 - Dithering Patterns
///////////////////////////////////////////////////////////////////////

// précalcul des matrices
const ditherPatterns = [];

const BAYER_SIZE = 4;
const BAYER_4x4  = [
    0,  8,  2, 10,
    12,  4, 14,  6,
    3, 11,  1,  9,
    15,  7, 13,  5
];

function initDitherPatterns() {
    for (let value = 0; value < 16; value++) {

        const intensity = value / 15 ;
        const pattern = new Uint8Array(BAYER_SIZE * BAYER_SIZE); // 16 entrées

        for (let i = 0 ; i < BAYER_SIZE*BAYER_SIZE ; i++ ) {
            // seuil Bayer : BAYER_4x4[i] va de 0 à 15, on divise par 16
            // (et non 15, pour que la valeur 15 ne soit pas toujours 100% blanc)
            pattern[i] = (intensity * 16 > BAYER_4x4[i]) ? 1 : 0;
        }
        
        ditherPatterns[value] = pattern;
    }
}

///////////////////////////////////////////////////////////////////////
// 4 - Inputs
///////////////////////////////////////////////////////////////////////

document.addEventListener('keydown', (event) => {
    
    if (playerActionDone) return;
    // console.log(event.key);

    switch(event.key) {
        // Avancer/Reculer
        case 'ArrowUp':
            nextPlayerPosX = playerPosX + (Math.sin(playerAngle) * playerStepRate);
            nextPlayerPosY = playerPosY + (Math.cos(playerAngle) * playerStepRate);
            break;
        case 'ArrowDown':
            nextPlayerPosX = playerPosX - (Math.sin(playerAngle) * playerStepRate);
            nextPlayerPosY = playerPosY - (Math.cos(playerAngle) * playerStepRate);
            break;
        // Rotation  
        case 'ArrowLeft':
            nextPlayerAngle = playerAngle - playerRotRate;
            break;
        case 'ArrowRight':
            nextPlayerAngle = playerAngle + playerRotRate;
            break;
        case 'e':
        case 'E': {

            // detection de proximitée
            const lookX = Math.trunc(playerPosX + Math.sin(playerAngle) * 1.2);
            const lookY = Math.trunc(playerPosY + Math.cos(playerAngle) * 1.2);
            const lookKey = lookY * mapWidth + lookX;
            const lookTile = map[lookKey];
            if ((lookTile === door || lookTile === doorV) && doors[lookKey] !== undefined) {
                const d = doors[lookKey];
                if (d.open < 0.5) { d.opening = true;  d.closing = false; }
                else               { d.closing = true;  d.opening = false; }
            }
            break;
        }
    }
    playerActionDone = true;
});

///////////////////////////////////////////////////////////////////////
// 5 - ENGINE/RAYCASTER
///////////////////////////////////////////////////////////////////////

// NEW : prends en compte les portes 
function checkCollision() {
    const bx = Math.trunc(nextPlayerPosX);
    const by = Math.trunc(nextPlayerPosY);
    const tile = map[by * mapWidth + bx];

    if (tile === wall) {
        nextPlayerPosX = playerPosX;
        nextPlayerPosY = playerPosY;
    } else if (tile === door || tile === doorV) {
        const d = doors[by * mapWidth + bx];
        if (!d || d.open < 1.0) {
            nextPlayerPosX = playerPosX;
            nextPlayerPosY = playerPosY;
        }
    }
}

function setPlayerNewPositionAndAngle() { 
    // on s'assure que la valeur reste entre 0 and 360 (2*PI) 
    if (nextPlayerAngle < 0) {
        nextPlayerAngle = nextPlayerAngle + PIx2;
    } 
    else if (nextPlayerAngle > PIx2) {
        nextPlayerAngle = nextPlayerAngle - PIx2;
    }      

    playerAngle = nextPlayerAngle; 
    playerPosX = nextPlayerPosX;
    playerPosY = nextPlayerPosY;
};


// Raycaster gère :
// - murs
// - portes
function raycasterDDA() {

    for (let x = 0; x < renderScreenWidth; x++) {

        // Position sur le plan caméra : -1 (gauche) à +1 (droite)
        let cameraX = 2 * x / renderScreenWidth - 1;

        // Direction du rayon (interpolation, pas de trigo !)
        const eyeX = dirX + planeX * cameraX;
        const eyeY = dirY + planeY * cameraX;

        // === Le reste du DDA est identique ===
        const deltaDistX = 1 / Math.abs(eyeX);
        const deltaDistY = 1 / Math.abs(eyeY);

        let mapX = playerTileX;
        let mapY = playerTileY;

        let stepX;
        let stepY;
        let sideDistX;
        let sideDistY;
        
        let distanceToWall = 0;
        let hitWall = false;
        let doorFoundThisColumn = false;
        let tileSide; 

        if   (eyeX > 0) { stepX =  1;
                        sideDistX = (mapX + 1 - playerPosX) * deltaDistX; }
        else            { stepX = -1;
                        sideDistX = (playerPosX - mapX) * deltaDistX; }
        
        if   (eyeY > 0) { stepY =  1;
                        sideDistY = (mapY + 1 - playerPosY) * deltaDistY; }
        else            { stepY = -1;
                        sideDistY = (playerPosY - mapY) * deltaDistY; }

        // Pourquoi utiliser une valeur intérmédiaire ?
        // let dist = 0;
        // existe déjà : "distanceToWall"
        while (!hitWall && distanceToWall < maxRayDepth) {
            
            if (sideDistX < sideDistY) {
                distanceToWall = sideDistX;
                sideDistX += deltaDistX;
                mapX += stepX;

                tileSide = VERTICAL;
            } else {
                distanceToWall = sideDistY; 
                sideDistY += deltaDistY;
                mapY += stepY;
                
                tileSide = HORIZONTAL;
            }
            
            let hitTile = map[mapY * mapWidth + mapX];

            if        (hitTile == wall) {
                
                hitWall = true; 

                const rayHitPosX = playerPosX + (eyeX * distanceToWall);
                const rayHitPosY = playerPosY + (eyeY * distanceToWall);        

                // quelle portion du mur est touché ? 
                let wallSlice;
                // calcul de la distance perpendiculaire (pour estimer la hauteur des colonnes) - plus de fisheye
                let perpWallDist;

                if      (tileSide === VERTICAL) {
                    perpWallDist = (mapX - playerPosX + (1 - stepX) / 2) / eyeX;

                    if  (eyeX > 0) wallSlice = ((rayHitPosY - mapY)*16) | 0;
                    else           wallSlice = ((rayHitPosY - mapY)*16) | 0;
                    }
                else if (tileSide === HORIZONTAL) {      
                    perpWallDist = (mapY - playerPosY + (1 - stepY) / 2) / eyeY;

                    if  (eyeY > 0) wallSlice = ((rayHitPosX - mapX)*16) | 0;
                    else           wallSlice = ((rayHitPosX - mapX)*16) | 0;
                }

                // pour l'occlusion des sprites : on enregistre la distance du rayon du mur, 
                // on exclue la colonne du sprite s'il vient avant ce dernier
                ZBuffer[x] = perpWallDist; // ou perpDist pour la porte

                // buffer pour sol/plafond
                wallHitX[x] = rayHitPosX;
                wallHitY[x] = rayHitPosY;
                wallDist[x] = perpWallDist;
                
                wallSlice = Math.min(wallSlice, 15);

                // on utilise à présent la distance perpendiculaire plutôt que la longueur du rayon
                drawColumn(perpWallDist, x, wallSlice, tileSide);   

            } 
            
            // LES PORTES !!!
            else if (hitTile === door || hitTile === doorV) {

                const isDoorD = (hitTile === door);

                // NOUVEAU : le battant n'est visible que si le rayon entre par la face
                // perpendiculaire à l'axe de déplacement de la porte. Sinon, c'est un
                // jambage (le renfoncement autour du battant) : un mur plein classique.
                const properDoorFace = isDoorD
                    ? (tileSide === VERTICAL)
                    : (tileSide === HORIZONTAL);

                if (!properDoorFace) {
                    // JAMBAGE : traité en tout point comme un mur classique
                    hitWall = true;

                    const rayHitPosX = playerPosX + (eyeX * distanceToWall);
                    const rayHitPosY = playerPosY + (eyeY * distanceToWall);

                    let wallSlice;
                    let perpWallDist;

                    if (tileSide === VERTICAL) {
                        perpWallDist = (mapX - playerPosX + (1 - stepX) / 2) / eyeX;
                        wallSlice = ((rayHitPosY - mapY) * 16) | 0;
                    } else {
                        perpWallDist = (mapY - playerPosY + (1 - stepY) / 2) / eyeY;
                        wallSlice = ((rayHitPosX - mapX) * 16) | 0;
                    }

                    ZBuffer[x] = perpWallDist;

                    wallHitX[x] = rayHitPosX;
                    wallHitY[x] = rayHitPosY;
                    wallDist[x] = perpWallDist;

                    wallSlice = Math.min(wallSlice, 15);

                    drawColumn(perpWallDist, x, wallSlice, tileSide);

                    continue; // sort de cette itération ; hitWall=true stoppe le while
                }

                // console.log("door !")

                const d = doors[mapY * mapWidth + mapX];
                const openOffset = d ? d.open : 0;

                // Position du rayon au milieu de la case = surface de la porte
                // NOUVEAU : intersection directe avec le plan du battant, fixe dans le
                // monde à mapX+0.5 / mapY+0.5, plutôt qu'un décalage en "unités de rayon"
                // (deltaDist * 0.5) qui devenait instable à angle rasant (deltaDist explose
                // quand le rayon devient parallèle au plan de la porte)
                const midDist = isDoorD
                    ? (mapX + 0.5 - playerPosX) / eyeX
                    : (mapY + 0.5 - playerPosY) / eyeY;

                // Le plan de la porte (mapX/mapY + 0.5) est infini : son intersection avec le
                // rayon peut mathématiquement exister en dehors du segment [entrée, sortie]
                // de la case DDA courante. On le vérifie explicitement, sinon on risque de
                // valider une intersection qui appartient en réalité à une autre case du
                // parcours du rayon (avant ou après celle-ci).
                const exitDist = Math.min(sideDistX, sideDistY);
                if (midDist < distanceToWall || midDist > exitDist) {
                    continue;
                }

                const midX = playerPosX + eyeX * midDist;
                const midY = playerPosY + eyeY * midDist;

                // hitU : coordonnée sur la face perpendiculaire (0→1)
                // IMPORTANT : on garde Math.trunc(midX/midY), pas mapX/mapY — midX/midY
                // peuvent avoir dérivé hors de la case d'origine (mapX, mapY) à angle oblique
                let hitU = isDoorD
                    ? midY - Math.trunc(midY)
                    : midX - Math.trunc(midX);

                // Normaliser selon le sens du rayon
                if (isDoorD  && stepX < 0) hitU = 1 - hitU;
                if (!isDoorD && stepY < 0) hitU = 1 - hitU;
                hitU = Math.max(0, Math.min(1, hitU));

                if (hitU < openOffset) continue; // zone ouverte, le rayon passe

                // NOUVEAU : si une porte a déjà été dessinée sur cette colonne, on ignore les suivantes
                if (doorFoundThisColumn) continue;
                doorFoundThisColumn = true;

                // NON !!
                hitWall = true; // <-- à ajouter : la porte a été dessinée, le rayon s'arrête ici

                // Distance perpendiculaire à la surface
                // NOUVEAU : midDist EST déjà cette distance perpendiculaire (plan fixe),
                // plus besoin de la recalculer séparément
                const perpDist = midDist;

                // on ajoute une valeur dans le ZBuffer pour l'occlusion des sprites par les portes
                // ZBuffer.push(perpDist);
                ZBuffer[x] = perpDist; // ou perpDist pour la porte

                // pour le dessin sol/plafond
                wallHitX[x] = midX;
                wallHitY[x] = midY;
                wallDist[x] = perpDist;

                // Coordonnée texture : la texture glisse avec la porte
                const wallSlice = Math.min(
                    Math.trunc((hitU - openOffset) * wallTextureSize),
                    wallTextureSize - 1
                );

                // Dessin dans le renderBuffer
                const ceiling = renderScreenHeight / 2 - renderScreenHeight / perpDist;
                const floor   = renderScreenHeight - ceiling;

                for (let y = Math.max(0, Math.ceil(ceiling));
                        y <= Math.min(renderScreenHeight, Math.trunc(floor));
                        y++) {
                    const sampleY = Math.min(
                        Math.trunc(((y - ceiling) / (floor - ceiling)) * wallTextureSize),
                        wallTextureSize - 1
                    );

                    const texValue = doorTexture[sampleY * wallTextureSize + wallSlice];

                    // 4 paliers identiques aux murs + offset porte légèrement plus sombre
                    const doorOffset = -2;
                    const shadeValue = perpDist < 3
                        ? texValue
                        : perpDist < 6
                            ? Math.max(0, texValue - 3)
                            : perpDist < 10
                                ? Math.max(0, texValue - 6)
                                : Math.max(0, texValue - 10);

                    doorRenderBuffer[y * renderScreenWidth + x] = Math.max(0, shadeValue + doorOffset);
                }
            }                
        };
    }
}

// ajouter shader sur surface horizontale
function drawColumn(distanceToWall, x, wallSlice, tileSide) {
    // calcul de la distance entre le sol et le plafond pour la colonne
    const ceiling = renderScreenHeight / 2 - renderScreenHeight / distanceToWall ; 
    // le sol n'est qu'un "mirroir" du plafond
    const floor = renderScreenHeight - ceiling;

    for (let y = 0; y < renderScreenHeight ; y++) {
        // PLAFOND
        if (y < ceiling) {
            // on applique une valeur numérique pour le dithering
            renderBuffer[y*renderScreenWidth + x] = 0;
        }
        // MURS — shading discret : 2 états (proche/lointain)
        else if (y > ceiling && y <= floor) {       
            let sampleY = Math.min((Math.trunc(((y - ceiling) / (floor - ceiling)) * 16)), 15);

            const texValue = wallTexture[sampleY * wallTextureSize + wallSlice];
            const sideOffset = (tileSide === HORIZONTAL) ? -2 : 0;

            const wallValue = distanceToWall < 3
                ? texValue                            // palier 1 : texture brute
                : distanceToWall < 6
                    ? Math.max(0, texValue - 3)       // palier 2
                    : distanceToWall < 10
                        ? Math.max(0, texValue - 6)   // palier 3
                        : Math.max(0, texValue - 10); // palier 4 : quasi noir

            renderBuffer[y * renderScreenWidth + x] = Math.max(0, wallValue + sideOffset);
        }
        // SOL géré par drawFloor - activer/désactiver pour performances ?
        else {
            // On applique un dégradé pour un effet de profondeur dans la seconde moitié de l'écran (sol)
            let floorHeight = 1 - ((y - renderScreenHeight / 2 ) / (renderScreenHeight / 2));
            // dégradé basé sur la hauteur de la colone
            let floorShade = 10 - floorHeight * 10;
            // Application shader effet de perspective
            renderBuffer[y * renderScreenWidth + x] = floorShade;
        }
    }
}

function drawFloor() {
    for (let y = renderScreenHeight / 2 ; y < renderScreenHeight; y++) {

        // Distance perpendiculaire au sol pour cette ligne
        // À l'horizon (y = renderScreenHeight/2) → infini
        // En bas de l'écran (y = renderScreenHeight) → très proche
        let rowDistance = renderScreenHeight / (y - renderScreenHeight / 2);

        // Shading aligné sur les murs : 4 paliers identiques
        let shade;
        if      (rowDistance < 3)  shade =  0;
        else if (rowDistance < 6)  shade = -3;
        else if (rowDistance < 10) shade = -6;
        else                       shade = -10;

        for (let x = 0; x < renderScreenWidth; x++) {

            // PRIORITÉ : si le mur est plus proche que cette ligne de sol, on skippe
            if (wallDist[x] < rowDistance) continue;

            // Interpolation ancrée sur le point mur
            const weight = rowDistance / (wallDist[x] || 1); // évite division par 0

            const floorX = weight * wallHitX[x] + (1 - weight) * playerPosX;
            const floorY = weight * wallHitY[x] + (1 - weight) * playerPosY;

            // Coordonnées texture — modulo positif (le % JS peut être négatif)
            let tx = ((Math.trunc(floorX * wallTextureSize) % wallTextureSize) + wallTextureSize) % wallTextureSize;
            let ty = ((Math.trunc(floorY * wallTextureSize) % wallTextureSize) + wallTextureSize) % wallTextureSize;

            // Clamp de sécurité
            tx = Math.max(0, Math.min(wallTextureSize - 1, tx));
            ty = Math.max(0, Math.min(wallTextureSize - 1, ty));

            const idx      = ty * wallTextureSize + tx;
            const texValue = floorTexture[idx];

            renderBuffer[y * renderScreenWidth + x] = Math.max(0, texValue + shade);
        }
    }
}

function drawCeiling() {
    // on parcourt de 0 à l'horizon (miroir du sol)
    for (let y = 0; y < renderScreenHeight / 2; y++) {

        // miroir de drawFloor : on mesure depuis l'horizon vers le haut
        let rowDistance = renderScreenHeight / (renderScreenHeight / 2 - y);

        // Shading aligné sur les murs : 4 paliers identiques
        let shade;
        if      (rowDistance < 3)  shade =  0;
        else if (rowDistance < 6)  shade = -3;
        else if (rowDistance < 10) shade = -6;
        else                       shade = -10;

        for (let x = 0; x < renderScreenWidth; x++) {

            if (wallDist[x] < rowDistance) continue;

            const weight = rowDistance / (wallDist[x] || 1);

            // miroir : on utilise les mêmes points d'impact mur
            const ceilX = weight * wallHitX[x] + (1 - weight) * playerPosX;
            const ceilY = weight * wallHitY[x] + (1 - weight) * playerPosY;

            let tx = ((Math.trunc(ceilX * wallTextureSize) % wallTextureSize) + wallTextureSize) % wallTextureSize;
            let ty = ((Math.trunc(ceilY * wallTextureSize) % wallTextureSize) + wallTextureSize) % wallTextureSize;

            tx = Math.max(0, Math.min(wallTextureSize - 1, tx));
            ty = Math.max(0, Math.min(wallTextureSize - 1, ty));

            const idx      = ty * wallTextureSize + tx;
            const texValue = ceilingTexture[idx];

            renderBuffer[y * renderScreenWidth + x] = Math.max(0, texValue + shade);
        }
    }
}

function drawDoorColumns() {
    for (let i = 0; i < doorRenderBuffer.length; i++) {
        if (doorRenderBuffer[i] !== -1) {
            renderBuffer[i] = doorRenderBuffer[i];
        }
    }
}

function drawSprites() {

    // Inverse du déterminant de la matrice caméra
    let invDet = 1.0 / (planeX * dirY - dirX * planeY);
    
    ////////////////////////
    // Tri des sprites
    ////////////////////////

    // tableau de tri des sprites selon distance
    let PainterAlgorithm = [];

    // TRI DES SPRITES POUR LE PAINTER'S ALGORITHM :
    // on parcours le tableau des sprites
    // On garde ceux présents à l'écran
    // On tri du plus loin au plus proche
    // On dessine les sprites dans l'ordre
    for (let i = 0; i < sprites.length; i++) {
        let spriteX = sprites[i][0] - playerPosX;
        let spriteY = sprites[i][1] - playerPosY;

        // Transformation -> TransformY = dans le champ de la caméra ?
        //                   TransformX = Quelle hauteur du sprite par rapport à la profondeur ?
        let transformX = invDet * (dirY * spriteX - dirX * spriteY);
        let transformY = invDet * (-planeY * spriteX + planeX * spriteY);

        // le sprite est dans le bon plan de la caméra ? 
        // non, on passe à l'itération suivante
        if (transformY <= 0) continue;

        let spriteToSort = [i, transformX, transformY]
        PainterAlgorithm.push(spriteToSort);
    }

    // tri de la liste des sprites visibles
    PainterAlgorithm.sort( function (a, b) { return b[2] - a[2]; } );

    ////////////////////////
    // Tri des sprites
    ////////////////////////

    // A présent, on utilise plus le tableau "sprite" pour le dessin, mais "PainterAlgorithm" :
    // il contient les valeurs requises pour effectuer les dessins de chaque sprite présents à l'écran.
    for (let i = 0; i < PainterAlgorithm.length; i++) {

        let spriteIndex = PainterAlgorithm[i][0]
        let transformX  = PainterAlgorithm[i][1];
        let transformY  = PainterAlgorithm[i][2];

        // distance to wall est dans le zbuffer
        let spriteScreenX = (renderScreenWidth / 2) * (1 + transformX / transformY);

        // la hauteur et la largeur du sprite sont identiques, on ne calcule que la hauteur
        let spriteHeight = renderScreenHeight / transformY;
        let spriteWidth  = renderScreenWidth / transformY;

        // pas la peine de parcourir tout l'écran, juste ce qui concerne le sprite
        let spriteStartX = spriteScreenX - spriteWidth / 3; // divisé par 3 pour garder proportions
        let spriteEndX   = spriteScreenX + spriteWidth / 3; // divisé par 3 pour garder proportions

        // calcul de la distance entre le sol et le plafond pour la colonne
        // on peut ajuster la hauteur du sprite (ici, on divise par 2 pour garder les proportions)
        const spriteCeiling = renderScreenHeight / 2 - spriteHeight / 2;
        const spriteFloor   = renderScreenHeight - spriteCeiling;

        let drawStartX = Math.max(0, Math.ceil(spriteStartX));
        let drawEndX = Math.min(renderScreenWidth,  Math.trunc(spriteEndX + 1));

        let drawStartY = Math.max(0, Math.ceil(spriteCeiling));
        let drawEndY = Math.min(renderScreenHeight, Math.trunc(spriteFloor + 1));

        // Point 1 : shading discret selon distance — même logique que les murs
        const isClose     = transformY < 4;
        const shadeOffset = isClose ? 0 : -5;

        for (let x = drawStartX; x < drawEndX; x++) {

            // Si le mur est plus proche, on skip cette colonne
            if (transformY > ZBuffer[x]) continue;

            for (let y = drawStartY; y < drawEndY; y++) {
                // Position relative dans le sprite (0 à 1) :
                let sampleY = (((y - spriteCeiling) / (spriteFloor - spriteCeiling)) * 16) | 0;
                let sampleX = (((x - spriteStartX) /  (spriteEndX  - spriteStartX )) * 16) | 0;

                const texVal = spriteTest[sampleY * wallTextureSize + sampleX];

                if (texVal === -1) continue; // transparence

                if (texVal === undefined || isNaN(texVal)) {
                    console.log("Valeur invalide pour sampleX:", sampleX, "sampleY:", sampleY, "value:", texVal, "spriteStartX:", spriteStartX, "spriteEndX :", spriteEndX );
                    stopTheLoop = true;
                }

                const value = Math.max(0, texVal + shadeOffset);

                renderBuffer[y * renderScreenWidth + x] = value;
            }
        }
    }
};

// Les conditions ternaires suivant la déclaration d'une constante permet de calculer
// la valeur sans utiliser de variable intermédiaire.
// Permet de ne pas polluer le scope

// Nouveau applyDithering : Bayer 4×4, rendu 1-bit dans imageData (canvas)
//
// Pour chaque cellule logique (x, y) du renderBuffer :
//   → on récupère son pattern précalculé (16 bits, un par sous-pixel du bloc 4×4)
//   → on écrit 16 pixels dans imageData aux coordonnées canvas correspondantes
//
// Coordonnées canvas du sous-pixel (bx, by) dans la cellule (x, y) :
//   cx = x * BAYER_SIZE + bx
//   cy = y * BAYER_SIZE + by
//
// Index dans imageData (format RGBA, 4 octets/pixel) :
//   (cy * canvasWidth + cx) * 4
function applyDithering() {
    for (let y = 0; y < renderScreenHeight; y++) {
        for (let x = 0; x < renderScreenWidth; x++) {
            // on prévient les float avec math.trunc(value)
            let value = Math.max(0, Math.min(15, Math.trunc(renderBuffer[y * renderScreenWidth + x])));
            const pattern = ditherPatterns[value];

            const BAYER_4x4_size = 4;
        
            const canvasBaseX = x * 4;
            const canvasBaseY = y * 4;

            for (let by = 0; by < BAYER_4x4_size; by++) {
                for (let bx = 0; bx < BAYER_4x4_size; bx++) {
                    // 255 si blanc (1), 0 si noir (0)
                    // on multiplie par 255 sans branchement : bit * 255
                    const color = pattern[by * BAYER_SIZE + bx] * 255;

                    // index dans le tableau RGBA
                    // (cy * canvasWidth + cx) * 4
                    const idx = ((canvasBaseY + by) * canvasElement.width + (canvasBaseX + bx)) * 4;

                    // RGBA : R=G=B=color, A=255 (opaque)
                    pixels[idx]     = color; // R
                    pixels[idx + 1] = color; // G
                    pixels[idx + 2] = color; // B
                    pixels[idx + 3] = 255;   // A
                }
            }
        }
    }
}

// Envoi de l'ImageData au canvas en une seule opération
function renderScreenBuffer() {
    ctx.putImageData(imageData, 0, 0);

}

///////////////////////////////////////////////////////////////////////
// boucle de jeux
///////////////////////////////////////////////////////////////////////

function gameLoop() {
    if (stopTheLoop) return;
    
    frameCount++; const now = performance.now(); // affichage des fps (pas mon code)
    if (now - lastFpsUpdate >= 1000) { console.log('FPS:', frameCount); frameCount = 0; lastFpsUpdate = now;}

    /*///////////////////////////////////////
    /!\ Vérification gamelogic en premier /!\
    /!\ Attention à l'ordre des fonctions /!\
    ///////////////////////////////////////*/
    checkCollision();
    setPlayerNewPositionAndAngle()
    updateDoors();

    /*/////////////////////////////////////
    // partie graphique DDA puis dessins //
    // Attention à l'ordre des fonctions //
    /////////////////////////////////////*/

    // variable pour calcul raycasting/sprite/sol/plafond
    playerTileX = Math.trunc(playerPosX);
    playerTileY = Math.trunc(playerPosY);
    // Calcul des vecteurs caméra (une seule fois par frame)
    dirX = Math.sin(playerAngle);
    dirY = Math.cos(playerAngle);
    // 0.414 = Math.tan(playerFOV / 2)
    planeX =  Math.cos(playerAngle) * 0.414;
    planeY = -Math.sin(playerAngle) * 0.414;

    // Reset le buffer (peut être pas la meilleure solution mais évite les "undefined")
    renderBuffer.fill(0);
    // RAPPEL : -1 = transparence
    doorRenderBuffer.fill(-1)

    raycasterDDA();

    // sol/plafond — lit wallHitX/Y/Dist, respecte wallDist comme ZBuffer
    // Penser à fusionner les deux fonctions avec une la possibilité d'avoir
    // une skybox (ça va être niiice)
    drawCeiling();
    drawFloor();
    // dessiné après les murs/sol
    drawDoorColumns(); // NOUVEAU : remplace l'ancien drawDoors()
    // dessins des sprites juste APRES le raycaster et AVANT le dithering
    // NOUVEAU PROBLEME : bah les sprites sont dessinés par dessus la porte lol
    // Test : dessiner sprite avant porte
    drawSprites()

    /*/////////////////////////////////////
    // dithering sur buffer et rendering //
    /////////////////////////////////////*/

    // transforme les valeurs de shade en matrice 2x2 pour le rendu final
    applyDithering();
    // rendu de l'écran avec les données calculées dans le buffer de frame
    renderScreenBuffer();

    // console.log(ZBuffer);
    // on vide le z-buffer à la fin de chaque cycle
    ZBuffer = new Array(renderScreenWidth).fill(Infinity);
    playerActionDone = false;
};

// initialisation des portes
// doit être appelé à chaque changement de carte
initDoors()

// Initialisation de la table précalculée
initDitherPatterns();

// fonction native de récursivité, interval en ms
setInterval(gameLoop, UPDATE_INTERVAL);