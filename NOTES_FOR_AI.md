- noticed this error when loading the app heres a copnsole duimp
    index-OyrASW8s.js:3449 🌀 @strudel/core loaded 🌀
    index-OyrASW8s.js:3609 ⚛️  React UI - Initialized!
    index-OyrASW8s.js:3609 🏈 Blood Bowl Sevens - Ready!
    index-OyrASW8s.js:3609 📡 EventBus - Ready for communication!
    index-OyrASW8s.js:3609 Failed to load cloud match save: FirebaseError: Missing or insufficient permissions.
    (anonymous) @ index-OyrASW8s.js:3609
    await in (anonymous)
    (anonymous) @ index-OyrASW8s.js:3609
    (anonymous) @ index-OyrASW8s.js:3422
    (anonymous) @ index-OyrASW8s.js:3422
    (anonymous) @ index-OyrASW8s.js:913
    Promise.then
    registerStateListener @ index-OyrASW8s.js:913
    onAuthStateChanged @ index-OyrASW8s.js:913
    cne @ index-OyrASW8s.js:1138
    nw @ index-OyrASW8s.js:3422
    sw @ index-OyrASW8s.js:3422
    Cwe @ index-OyrASW8s.js:3529
    (anonymous) @ index-OyrASW8s.js:3609

- do a redesign for the advancement mode dropdown ion the build team so it matches the style of the other options maybe just add it to the list under team colours, in that style.

- team builder also says that reroles cost double thats not true in sevens they just cannot be bought but by default when drafing the team they cost double. right now in draft teh rerol is the original price but it should be double

- i also wanna remove the stats overview from the overview page and add the stats overview to the detail page for the team 

- can we do a redesign for the team select in local play, i have so many teams so teh page is so long

- chain push test is now not working ebcause black orcs have grab so they cannot push into the dudes behind because there are more options because they ahve the geab skill by default

- why id the doubd just like boom boom boom boom theres nothing else to it and the mute and volume slider dont do anything in standbox mode.

- why did you make e2e testcases when we should just hva efilled out the exiusting testcases that we had for each section dont just remove them but wwhy can we keep then in each seciton and just have added extra test cases that I can use 

- sound persists even when leaving the game anmd is terrible, we need an overhaul of sound and to fix eveything there

- sound popup also covers the top right corner stuff, move it into the mactch options button in the bottom right as an option

- charge, the result oin the kick off table has stopped working it wont let me move my gus.

- seeding the game is not working since i roilled the kickoff table and got one result and then i refreshed the game and rerolled the kick off tabl;e result and go a different result this will knock games out of sync so lets make sure its cnonsistanbt and you cannot double roll a socre to get a different result 

- kick off table results description get pushed down the page in a really annying way when you hover a player since they are in the same block, make sure it doesn move when its up perhapse it should be top right and the player and other highlights should go underneath since this is static content until that section is gone, actually the selected player should be under that and the hoverd player shyould be under that since the hover is the shortest popup type sp please get that order from top to bottom correct, [static section notes] -> selected player -> [hovered content]

- the kick off results note often has a x/x in the top right butas i select and move players the number is not updated so its kinda dumb. make the number update correctly

- KO player from foul was not removed to the KO box when the foul was finished and also the hughlight red underneath the palyer stayed after the players activation ended, it should have ended. also sendt off player was not remvoed from the filed, they can gop to the dugout with a redcard icon or something to show that they cannot play the rest of thebgame.

