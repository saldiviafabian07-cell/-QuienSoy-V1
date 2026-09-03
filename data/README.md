# Datos editables de JuNTa2

Esta carpeta contiene el contenido configurable de los minijuegos. Las salas,
usuarios, amigos, invitaciones y resultados siguen viviendo en Firebase.

## ¿Quién soy?

- Personajes: `data/whoami/characters.js`.
- Categorías: `data/whoami/categories.js`.
- Para agregar un personaje, agrega un objeto a `characters` con `id`,
  `nombre`, `categoria` e `imagen`.
- `id` debe ser único, `nombre` y `categoria` no deben estar vacíos, e
  `imagen` debe apuntar a un archivo existente dentro de `img/`.
- Para cambiar una imagen, modifica solamente el valor de `imagen`, por
  ejemplo `"./img/227-Kirito.jpg"`.

Ejemplo válido:

```js
{
  id: 228,
  nombre: "Personaje nuevo",
  categoria: "Series",
  imagen: "./img/228-PersonajeNuevo.jpg"
}
```

Si agregas una categoría nueva al personaje, agrega también el mismo texto en
`data/whoami/categories.js` para que aparezca en la selección de salas.

## Los demás minijuegos

- Adivina la Edad: `data/age/data.js` contiene límites y tiempos editables.
- ConFESa2 🔥: `data/confessions/data.js` contiene la longitud
  máxima y los modos de rondas. Las confesiones de los jugadores se guardan
  temporalmente en Firebase, no en este repositorio.
- STOP: `data/stop/data.js` contiene las letras, categorías y categorías
  seleccionadas por defecto.
- ChaMuYa2: `data/chamuyaya/data.js` contiene los datos/frases que se muestran
  durante las rondas.
- CULTURA CHUPÍSTICA: `data/chupistica/data.js` contiene sus categorías
  locales.
- Tribunal Express: `data/tribunal/data.js` contiene los casos, evidencias,
  defensas, coartadas, testigos y objetos.
- WHAT WOULD YOU DO?: `data/whatwouldyoudo/data.js` contiene las 15 categorías
  y las preguntas editables. Cada pregunta necesita `id`, `category`, `optionA`
  y `optionB`.

Conserva los campos que ya usa cada juego. En Tribunal, por ejemplo, un caso
válido necesita `delito` y sus listas `evidencias`, `defensas`, `coartadas`,
`evidenciasSorpresa`, `testigos` y `objetos`.

No muevas imágenes dentro de `data/`: déjalas en `img/` y usa rutas relativas
que comiencen por `./img/`. Los módulos ES se cargan desde `index.html` y esas
rutas se resuelven desde la página, por lo que funcionan en GitHub Pages.
