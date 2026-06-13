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