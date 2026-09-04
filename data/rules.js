// Contenido editable de la guía interactiva de cada juego.
// Este archivo solo describe las mecánicas que ya existen en la aplicación.
export const GAME_RULES = {
  whoami: {
    title: '¿QUIÉN SOY?',
    emoji: '🎭',
    modes: [
      { icon: '🌐', label: 'ONLINE', text: 'Cada jugador usa su dispositivo y la sala sincroniza la partida.' },
      { icon: '📱', label: 'UNA PANTALLA', text: 'El teléfono se comparte siguiendo el turno indicado.' }
    ],
    steps: [
      { title: 'Configura', text: 'Elige categorías, cantidad de rondas y el modo de juego.' },
      { title: 'Revela', text: 'Cada jugador recibe un personaje. En local se muestra al resto, no al jugador correspondiente.' },
      { title: 'Juega', text: 'En online se ven los personajes de los compañeros y se evalúa la ronda.' },
      { title: 'Resultado', text: 'Se asignan los puntos de la ronda y se continúa hasta terminar.' }
    ],
    sections: [
      {
        id: 'objective', icon: '🎯', title: 'OBJETIVO',
        paragraphs: ['Cada jugador recibe un personaje de las categorías seleccionadas. La meta es descubrir y evaluar correctamente los resultados de la ronda.'],
        demo: { label: 'ASÍ SE VE UNA RONDA', items: ['👤 Jugador A · personaje asignado', '👤 Jugador B · personaje asignado', '🗳️ La ronda pasa a evaluación'] }
      },
      {
        id: 'online', icon: '🌐', title: 'MODO ONLINE',
        paragraphs: ['El anfitrión crea la sala y los demás entran con el código. La partida pasa por preparación, reveal, juego, resultado y final.', 'Durante la partida cada jugador puede ver los personajes públicos de sus compañeros; su propia asignación se entrega por separado.'],
        bullets: ['El anfitrión abre la evaluación cuando corresponde.', 'Cada jugador evalúa a los demás, nunca a sí mismo.', 'La sala sincroniza ronda, votos y resultados.'],
        demo: { label: 'FLUJO ONLINE', items: ['1 · LOBBY', '2 · PREPARACIÓN Y REVEAL', '3 · PARTIDA', '4 · EVALUACIÓN', '5 · RESULTADO'] }
      },
      {
        id: 'local', icon: '📱', title: 'UNA PANTALLA',
        paragraphs: ['Se pasa un solo teléfono entre todos. El nombre de la persona aparece primero y hay 5 segundos para entregar el celular.', 'Cuando termina la cuenta: la persona indicada NO debe mirar la pantalla; los demás SÍ pueden mirar. Se revela el personaje correspondiente y se repite con el siguiente jugador.'],
        note: 'La pantalla final permite tocar un jugador para mostrar u ocultar únicamente su personaje.',
        demo: { label: 'PASE DEL TELÉFONO', items: ['LE TOCA A JUGADOR X', '5 · 4 · 3 · 2 · 1', 'JUGADOR X, NO MIRES', 'LOS DEMÁS PUEDEN MIRAR', 'REVEAL DEL PERSONAJE'] }
      },
      {
        id: 'voting', icon: '🗳️', title: 'EVALUACIÓN ONLINE',
        paragraphs: ['Cada jugador evalúa el resultado de los demás con una de las tres opciones disponibles. Los votos se registran una sola vez por jugador y objetivo.'],
        cards: [
          { icon: '✓', title: 'VÁLIDO', text: 'Suma 10 puntos.' },
          { icon: '〰️', title: 'MEDIO / REPETIDA', text: 'Suma 5 puntos.' },
          { icon: '✕', title: 'INCORRECTO', text: 'Suma 0 puntos.' }
        ],
        note: 'Si no hay una mayoría única, el resultado es SIN MAYORÍA y entrega 0 puntos.'
      },
      {
        id: 'local-score', icon: '🏆', title: 'RESULTADO LOCAL',
        paragraphs: ['En el modo de una pantalla, el anfitrión asigna los lugares de la ronda: primer lugar 3 puntos, segundo lugar 2 y tercer lugar 1.'],
        note: 'La partida conserva el marcador entre rondas y al terminar muestra el resultado final.'
      }
    ]
  },

  chupistica: {
    title: 'CULTURA CHUPÍSTICA',
    emoji: '🍺',
    modes: [{ icon: '📱', label: 'LOCAL', text: 'Es un juego de una pantalla: no crea salas ni usa lobby online.' }],
    steps: [
      { title: 'Agrega jugadores', text: 'Escribe los nombres y elige la dirección del turno.' },
      { title: 'Gira', text: 'La ruleta selecciona quién comienza.' },
      { title: 'Categoría', text: 'La segunda ruleta selecciona el tema de la ronda.' },
      { title: 'Responde', text: 'La persona seleccionada comienza con la categoría indicada.' }
    ],
    sections: [
      { id: 'objective', icon: '🎯', title: 'OBJETIVO', paragraphs: ['La ruleta decide quién comienza y qué categoría se debe responder. El teléfono funciona como ruleta y marcador de la ronda.'] },
      { id: 'setup', icon: '👥', title: 'PREPARACIÓN', paragraphs: ['Agrega entre 2 y 20 jugadores, escribe sus nombres y selecciona si el turno continúa hacia la izquierda o hacia la derecha.'], demo: { label: 'ANTES DE GIRAR', items: ['👥 Nombres de los jugadores', '↔️ Dirección del turno', '▶️ COMENZAR PARTIDA'] } },
      { id: 'roulette', icon: '🎡', title: 'RULETA Y CATEGORÍA', paragraphs: ['La primera ruleta elige al jugador que comienza. Después, la segunda ruleta elige una categoría de la lista editable.'], note: 'La aplicación evita repetir inmediatamente la última categoría. Cuando se recorren todas, la lista de categorías comienza nuevamente.', demo: { label: 'DOS GIROS', items: ['GIRO 1 · JUGADOR', 'GIRO 2 · CATEGORÍA', '¡EL JUGADOR COMIENZA!'] } },
      { id: 'rounds', icon: '🔄', title: 'SIGUIENTE RONDA', paragraphs: ['Al pulsar la siguiente ronda, se repite la selección de jugador y categoría manteniendo la dirección elegida.'] },
      { id: 'score', icon: '🏁', title: 'PUNTUACIÓN', paragraphs: ['El código actual no asigna puntos en Cultura Chupística; la interfaz se concentra en la ruleta, el jugador y la categoría.'] }
    ]
  },

  age: {
    title: 'ADIVINA LA EDAD',
    emoji: '🎂',
    modes: [
      { icon: '🌐', label: 'ONLINE', text: 'Cada jugador usa su dispositivo y envía una estimación a la sala.' },
      { icon: '📱', label: 'UNA PANTALLA', text: 'La ronda usa el pase del celular y el reveal de edades.' }
    ],
    steps: [
      { title: 'Edad objetivo', text: 'Cada jugador recibe una edad diferente para la ronda.' },
      { title: 'Reveal', text: 'Se muestra la edad de cada jugador según el modo elegido.' },
      { title: 'Estimación', text: 'En online cada jugador envía un número entero dentro del rango permitido.' },
      { title: 'Distancia', text: 'Se calcula la diferencia entre la estimación y la edad objetivo.' }
    ],
    sections: [
      { id: 'objective', icon: '🎯', title: 'OBJETIVO', paragraphs: ['Acercarse lo máximo posible a la edad objetivo asignada. La edad se genera de forma distinta para cada jugador de la ronda.'], demo: { label: 'EJEMPLO', items: ['🎂 Edad objetivo: 27', '✍️ Estimación: 31', '📏 Diferencia: 4 años'] } },
      { id: 'online', icon: '🌐', title: 'MODO ONLINE', paragraphs: ['Cada jugador ve las edades de los demás, pero no necesita esperar un límite de tiempo para enviar su propia estimación. Puede enviar un entero entre 0 y 10.000 una sola vez por ronda.'], note: 'La ronda termina cuando todos los jugadores activos enviaron su estimación.' },
      { id: 'local', icon: '📱', title: 'UNA PANTALLA', paragraphs: ['El celular se entrega al jugador indicado durante 5 segundos. Después: ese jugador NO debe mirar y los demás SÍ pueden mirar. Aparece su edad y se continúa con el siguiente jugador.', 'Al terminar la secuencia de reveal, la pantalla de recuerdo permite consultar las edades individualmente tocando cada nombre.'], demo: { label: 'PASE DEL CELULAR', items: ['LE TOCA A JUGADOR X', '5 · 4 · 3 · 2 · 1', 'JUGADOR X, NO MIRES', 'LOS DEMÁS PUEDEN MIRAR', 'JX TIENE ··· AÑOS'] }, note: 'En la implementación actual, esta secuencia termina en la pantalla local de recuerdo de edades; no se agrega aquí una estimación local que no esté conectada al flujo actual.' },
      { id: 'points', icon: '🏆', title: 'PUNTUACIÓN ONLINE', paragraphs: ['Las distancias válidas se ordenan de menor a mayor: primer lugar suma 3 puntos, segundo 2 y tercero 1. Si hay empate en una posición, los jugadores empatados reciben los mismos puntos de esa posición y la siguiente posición avanza según el tamaño del grupo.'], note: 'Una estimación inválida no obtiene puntos.' },
      { id: 'rounds', icon: '🔄', title: 'RONDAS', paragraphs: ['El resultado muestra edad objetivo, estimación, diferencia, puesto y acumulado. Luego se puede iniciar la siguiente ronda hasta completar la cantidad configurada.'] }
    ]
  },

  confessions: {
    title: 'ConFESa2',
    emoji: '🔥',
    modes: [
      { icon: '🌐', label: 'ONLINE', text: 'Cada jugador escribe desde su propio dispositivo y la sala sincroniza la votación.' },
      { icon: '📱', label: 'UNA PANTALLA', text: 'Cada jugador escribe por turno y pasa el celular antes de la siguiente confesión.' }
    ],
    steps: [
      { title: 'Escribe', text: 'Cada jugador envía una confesión sin revelar su nombre.' },
      { title: 'Lee', text: 'La ronda presenta una confesión sin mostrar al autor.' },
      { title: 'Vota', text: 'Cada persona elige quién cree que la escribió.' },
      { title: 'Descubre', text: 'Se revela el autor, los votos y el marcador.' }
    ],
    sections: [
      { id: 'writing', icon: '✍️', title: 'ESCRITURA', paragraphs: ['Escribe algo que nadie del grupo sepa que hiciste. La confesión puede tener hasta 280 caracteres.', 'En local, después de guardar se limpia el campo y el teléfono queda preparado para el siguiente jugador. En online, tu envío queda bloqueado mientras se espera al resto.'], demo: { label: 'PASE LOCAL', items: ['JUGADOR 1 · ESCRIBE', 'GUARDAR · CAMPO LIMPIO', 'PASA EL TELÉFONO', 'JUGADOR 2 · ESCRIBE'] } },
      { id: 'voting', icon: '🗳️', title: 'VOTACIÓN', paragraphs: ['La confesión se muestra sin autor. Cada jugador vota una persona y no puede votarse a sí mismo. En local, los turnos de votación son privados y pasan por el mismo teléfono.'], cards: [{ icon: '✅', title: 'PUEDE VOTAR', text: 'Elige al jugador que crees que es el autor.' }, { icon: '🚫', title: 'NO PUEDE VOTAR', text: 'No puedes elegirte a ti mismo.' }] },
      { id: 'outcome', icon: '🎯', title: 'RESULTADO', paragraphs: ['Si una sola persona acierta, recibe 3 puntos. Si aciertan varias personas, cada una recibe 2 puntos. Si nadie acierta, el autor recibe 3 puntos.'], note: 'El resultado muestra la confesión, el autor, los votos y los puntos de la ronda.' },
      { id: 'rounds', icon: '🔄', title: 'RONDAS Y MARCADOR', paragraphs: ['El modo “una confesión por jugador” crea una ronda por jugador. Las opciones de 5 y 10 rondas se limitan a la cantidad disponible de participantes. Después de cada confesión se actualiza el marcador.'], demo: { label: 'CIERRE DE RONDA', items: ['📖 CONFESIÓN REVELADA', '🎯 ACIERTOS Y VOTOS', '🏆 MARCADOR', '➡️ SIGUIENTE CONFESIÓN'] } }
    ]
  },

  chamuyaya: {
    title: 'ChaMuYa2',
    emoji: '🎭',
    modes: [
      { icon: '🌐', label: 'ONLINE', text: 'La sala sincroniza cartas, discusión, votos y resultado.' },
      { icon: '📱', label: 'UNA PANTALLA', text: 'Las cartas se muestran por turnos en un solo teléfono.' }
    ],
    steps: [
      { title: 'Reparte', text: 'La configuración decide cuántos ChaMuYas habrá.' },
      { title: 'Mira tu carta', text: 'Los jugadores normales reciben un dato; los ChaMuYas no reciben ese dato.' },
      { title: 'Debate', text: 'Los normales demuestran que conocen el dato sin decirlo literalmente.' },
      { title: 'Vota', text: 'Cada jugador selecciona hasta el máximo de ChaMuYas configurado.' }
    ],
    sections: [
      { id: 'roles', icon: '🎭', title: 'ROLES', paragraphs: ['Hay jugadores normales y uno o más ChaMuYas. La cantidad de ChaMuYas se configura y siempre debe quedar al menos un jugador normal.'], cards: [{ icon: '🟢', title: 'JUGADOR NORMAL', text: 'Recibe un dato propio para la ronda.' }, { icon: '🔴', title: 'ChaMuYa', text: 'No recibe el dato y debe deducirlo.' }] },
      { id: 'reveal', icon: '🔐', title: 'REVEAL PRIVADO', paragraphs: ['En online cada jugador consulta su propia carta. En local el teléfono se pasa y cada jugador puede ver u ocultar su carta antes de entregarlo.'], demo: { label: 'CARTA', items: ['🔒 TU CARTA', '🧠 EL DATO · jugador normal', '🎭 ChaMuYa · sin dato'] } },
      { id: 'discussion', icon: '💬', title: 'DISCUSIÓN', paragraphs: ['Los jugadores normales deben demostrar que saben el dato sin decirlo directamente. Los ChaMuYas intentan deducirlo y pasar desapercibidos.'] },
      { id: 'voting', icon: '🗳️', title: 'VOTACIÓN', paragraphs: ['Cada jugador envía su elección una sola vez. Puede seleccionar hasta la cantidad de ChaMuYas configurada; debe seleccionar al menos una persona para enviar.'], note: 'El resultado compara las personas encontradas con todos los ChaMuYas reales.' },
      { id: 'result', icon: '🏁', title: 'RESULTADO', paragraphs: ['Los jugadores ganan si descubren a todos los ChaMuYas. Si no, ganan los ChaMuYas. El resultado también muestra el dato real y las identidades reveladas.'], note: 'El código actual no asigna puntos en ChaMuYa2.' }
    ]
  },

  tribunal: {
    title: 'SR. JUEZ',
    emoji: '🏛️',
    modes: [{ icon: '🌐', label: 'ONLINE', text: 'Sr. Juez utiliza salas online y necesita al menos 5 jugadores.' }],
    steps: [
      { title: 'Roles', text: 'Se reparten Juez, Fiscal, Abogado, Acusado y Jurado.' },
      { title: 'Caso', text: 'Cada rol recibe la información privada que necesita.' },
      { title: 'Juicio', text: 'Se presenta el caso, se debate y aparece la evidencia sorpresa.' },
      { title: 'Veredicto', text: 'Votan quienes corresponden y se calculan los puntos.' }
    ],
    sections: [
      { id: 'setup', icon: '👥', title: 'PREPARACIÓN', paragraphs: ['El juego es online y necesita mínimo 5 jugadores. La sala selecciona un caso y conserva la ronda, el host y los participantes.'], demo: { label: 'REPARTO MÍNIMO', items: ['⚖️ 1 JUEZ', '🔴 1 FISCAL', '🔵 1 ABOGADO', '🚨 1 ACUSADO', '👥 1 O MÁS JURADOS'] } },
      { id: 'roles', icon: '🎭', title: 'ROLES E INFORMACIÓN', paragraphs: ['El rol de cada jugador se entrega por el canal privado correspondiente. La información no se comparte durante la preparación.'], cards: [{ icon: '⚖️', title: 'JUEZ', text: 'Recibe el caso completo y dirige las transiciones del juicio.' }, { icon: '🔴', title: 'FISCAL', text: 'Recibe una evidencia para acusar.' }, { icon: '🔵', title: 'ABOGADO', text: 'Recibe una defensa para defender.' }, { icon: '🧑', title: 'ACUSADO', text: 'Recibe su delito y una coartada.' }, { icon: '👥', title: 'JURADO', text: 'Conoce el delito público y participa en la votación.' }] },
      { id: 'trial', icon: '⚖️', title: 'JUICIO', paragraphs: ['El Juez presenta el caso, continúa al debate, activa la evidencia sorpresa y finalmente abre la votación. Los demás esperan las transiciones del Juez.'], demo: { label: 'FASES', items: ['📜 PRESENTACIÓN', '💬 DEBATE', '🧩 EVIDENCIA SORPRESA', '🏛️ FINAL DEL JUICIO', '🗳️ VOTACIÓN'] } },
      { id: 'vote', icon: '🗳️', title: 'VOTACIÓN', paragraphs: ['Solo votan el Juez y el Jurado. Fiscal, Abogado y Acusado no votan. La cantidad esperada es el Juez más todos los Jurados.'], note: 'El acusado se determina comparando el resultado de la votación con el rol revelado al terminar la ronda.' },
      { id: 'points', icon: '🏆', title: 'PUNTUACIÓN', paragraphs: ['Jurado: 20 puntos si vota al acusado. Juez: 15 puntos si el veredicto es culpable. Fiscal: 20 puntos si es culpable. Abogado: 20 puntos si es absuelto. Acusado: 30 puntos si es absuelto.'], note: 'Los puntos se calculan una vez por jugador y se acumulan entre casos.' },
      { id: 'final', icon: '🏁', title: 'REVELACIÓN Y FINAL', paragraphs: ['Después de la votación se revela el resultado y los roles válidos de la ronda. El Juez puede continuar al siguiente caso o mostrar el resultado final.'] }
    ]
  },

  stop: {
    title: 'STOP',
    emoji: '🛑',
    modes: [{ icon: '🌐', label: 'ONLINE', text: 'STOP funciona online y todos escriben simultáneamente en la sala.' }],
    steps: [
      { title: 'Letra', text: 'La sala revela una letra elegida de la configuración.' },
      { title: 'Responde', text: 'Completa las categorías antes de que termine el tiempo.' },
      { title: 'STOP', text: 'Un jugador puede detener la ronda o puede agotarse el tiempo.' },
      { title: 'Revisa', text: 'Los jugadores evalúan las respuestas de los demás.' }
    ],
    sections: [
      { id: 'setup', icon: '⚙️', title: 'CONFIGURACIÓN', paragraphs: ['El host elige rondas, tiempo, letras y categorías. La configuración incluye categorías predeterminadas y permite agregar categorías personalizadas.'], demo: { label: 'CONFIGURABLE', items: ['🔤 LETRAS', '📝 CATEGORÍAS', '⏱️ 30 · 45 · 60 · 90 · 120 s', '🔄 3 · 5 · 10 · 15 RONDAS'] } },
      { id: 'playing', icon: '📝', title: 'JUGAR', paragraphs: ['La letra aparece para todos y los jugadores escriben al mismo tiempo. Cada respuesta debe tener al menos 2 caracteres y comenzar con la letra de la ronda.'], note: 'Al pulsar STOP se cierra la escritura y comienza la revisión; si nadie lo pulsa, la ronda termina por tiempo.' },
      { id: 'review', icon: '🗳️', title: 'EVALUACIÓN', paragraphs: ['Cada jugador evalúa las respuestas de los demás con VÁLIDO, MEDIO/REPETIDA o INCORRECTO. Nadie evalúa su propia respuesta.'], cards: [{ icon: '✅', title: 'VÁLIDO', text: 'La mayoría la considera válida y no está repetida.' }, { icon: '〰️', title: 'MEDIO / REPETIDA', text: 'Respuesta repetida o con resultado medio.' }, { icon: '❌', title: 'INCORRECTO', text: 'No cumple la letra o la mayoría la considera incorrecta.' }] },
      { id: 'points', icon: '🏆', title: 'PUNTUACIÓN', paragraphs: ['Respuesta válida: 10 puntos. Respuesta repetida: 5 puntos. Resultado medio: 5 puntos. Respuesta incorrecta o sin respuesta: 0 puntos.'], note: 'Una respuesta que no comienza con la letra de la ronda queda como incorrecta.' },
      { id: 'rounds', icon: '🔄', title: 'RESULTADO Y SIGUIENTE RONDA', paragraphs: ['El resultado muestra la letra, quién presionó STOP o si se agotó el tiempo, las respuestas y el detalle de votos. El host inicia la siguiente ronda o el resultado final.'] }
    ]
  },

  whatwouldyoudo: {
    title: 'WHAT WOULD YOU DO?',
    emoji: '⚡',
    modes: [{ icon: '🌐', label: 'ONLINE', text: 'Actualmente utiliza salas online; no muestra un modo local.' }],
    steps: [
      { title: 'Pregunta', text: 'Todos reciben la misma situación con dos alternativas.' },
      { title: 'Elige', text: 'Cada jugador vota A o B una sola vez.' },
      { title: 'Resultado', text: 'La sala cuenta los votos y calcula los porcentajes.' },
      { title: 'Siguiente', text: 'El host inicia otra ronda o muestra el final.' }
    ],
    sections: [
      { id: 'objective', icon: '🎯', title: 'OBJETIVO', paragraphs: ['Elegir qué harías ante una situación determinada y descubrir qué opción prefiere la mayoría del grupo.'], demo: { label: 'UNA PREGUNTA', items: ['❓ ¿QUÉ PREFIERES?', '🔵 OPCIÓN A', '🔴 OPCIÓN B'] } },
      { id: 'question', icon: '❓', title: 'LA PREGUNTA', paragraphs: ['Todos los jugadores reciben la misma pregunta, categoría y alternativas. Las preguntas provienen del banco editable y se evita repetir una pregunta usada mientras haya opciones disponibles.'], cards: [{ icon: '🔵', title: 'OPCIÓN A', text: 'Elige A para registrar esa alternativa.' }, { icon: '🔴', title: 'OPCIÓN B', text: 'Elige B para registrar esa alternativa.' }] },
      { id: 'voting', icon: '🗳️', title: 'VOTACIÓN', paragraphs: ['Cada jugador puede votar A o B una sola vez. Después de registrar el voto, sus botones quedan bloqueados y la sala muestra cuántas personas han respondido.'], demo: { label: 'ESTADO DE LA SALA', items: ['✅ Jugador A · voto registrado', '✅ Jugador B · voto registrado', '⏳ Jugador C · falta votar'] } },
      { id: 'result', icon: '📊', title: 'RESULTADO', paragraphs: ['Se muestran los votos y el porcentaje de A y B. Gana la opción con más votos. Si ambas tienen la misma cantidad, aparece EMPATE · TODOS PIERDEN.'], note: 'En empate nadie recibe el punto de la ronda. Quien vota la opción ganadora recibe 1 punto; los demás reciben 0.' },
      { id: 'rounds', icon: '🔄', title: 'RONDAS Y FINAL', paragraphs: ['El host inicia la siguiente ronda usando una nueva pregunta de las categorías seleccionadas. Al terminar la cantidad configurada, la sala pasa a resultados finales.'], demo: { label: 'CIERRE', items: ['A → votos → porcentaje', 'B → votos → porcentaje', '🏆 OPCIÓN GANADORA O EMPATE', '➡️ SIGUIENTE RONDA'] } }
    ]
  }
};
