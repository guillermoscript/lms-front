# 🎓 Tarea: Construcción de un Asistente Pokedex Inteligente con n8n

### **Contexto**

Como nuevo desarrollador en el Laboratorio del Prof. Oak, se te ha encomendado crear un sistema automatizado para que los entrenadores puedan consultar información de Pokémon y guardar sus favoritos en una base de datos. Para ello usarás **n8n**, la **PokeAPI** y agentes de **Inteligencia Artificial**.

---

### **Objetivos de Aprendizaje**

1.  Diferenciar y aplicar los métodos **GET** (obtener) y **POST** (enviar).
2.  Configurar un **AI Agent** en n8n que use herramientas (Tools).
3.  Estructurar datos en formato **JSON**.
4.  Consumir una API externa real.

---

### **Fase 1: Investigación de la API**

Antes de tocar n8n, debes entender qué estás consultando. Ve a la documentación de [PokeAPI](https://pokeapi.co/docs/v2):

- **Endpoint A (Datos técnicos):** Localiza el URL para obtener datos básicos de un Pokémon (peso, altura, tipos).
- **Endpoint B (Historia):** Localiza el URL para obtener la descripción o "flavor text" del Pokémon.
  - _Tip:_ Fíjate que este endpoint devuelve textos en muchos idiomas. ¿Cómo filtrarías para quedarte solo con el español?

---

### **Fase 2: Creando las Herramientas (Herramientas GET)**

En n8n, crea dos workflows independientes que servirán como "herramientas" para tu agente:

1.  **Workflow "Consultar Stats":**
    - Debe usar un nodo de disparo (Trigger) que reciba el nombre de un Pokémon.
    - Debe hacer una petición **GET** a la PokeAPI.
    - Debe devolver una respuesta limpia (JSON) con solo el nombre, los tipos y el peso.
2.  **Workflow "Consultar Lore":**
    - Debe hacer un **GET** al endpoint de _species_.
    - Debe extraer únicamente la descripción en español.

---

### **Fase 3: Simulando el Guardado (Método POST)**

La PokeAPI es de solo lectura, pero necesitamos practicar el envío de datos.

- **El Reto:** Crea un tercer workflow que actúe como tu "Base de Datos de Favoritos".
- **La Acción:** Debe recibir una petición **POST**.
- **El Cuerpo (Body):** El JSON enviado debe contener: `nombre_pokemon`, `entrenador_que_lo_guarda` y `motivo_de_eleccion`.
- _Tip:_ Puedes usar un nodo **Webhook** como disparador en este workflow para recibir los datos que el agente enviará.

---

### **Fase 4: El Agente de IA (El Cerebro)**

Crea un workflow principal con un nodo **Chat Trigger** y un **AI Agent**.

1.  Conecta un modelo de lenguaje (OpenAI, Groq o Anthropic).
2.  **Configura las Herramientas:** Añade tres nodos de tipo "Workflow Tool" y conéctalos a los tres workflows que creaste en las fases anteriores.
3.  **Instrucciones del Sistema (Prompt):** Define la personalidad del agente. Debe ser un experto Pokémon.
    - _Tip Crucial:_ La "Descripción de la herramienta" es lo que la IA lee para decidir qué nodo usar. Sé muy claro. Ejemplo: _"Úsala cuando el usuario quiera guardar un Pokémon en sus favoritos"_.

---

### **Fase 5: Pruebas de Validación**

Tu tarea estará completa cuando puedas abrir el chat de n8n y hacer lo siguiente:

1.  **Preguntar:** "¿Qué tan pesado es Snorlax?" (Debe disparar el GET de Stats).
2.  **Preguntar:** "¿Qué dice la leyenda de Mewtwo?" (Debe disparar el GET de Lore).
3.  **Ordenar:** "Me encanta Arcanine, guárdalo en mis favoritos porque es muy fiel" (Debe disparar el POST con la estructura JSON correcta).

---

### 💡 Tips para el éxito:

- **GET vs POST:** Recuerda que en el **GET** la información suele ir en la URL (parámetros), mientras que en el **POST** la información viaja oculta en el **Body** de la petición.
- **JSON:** Revisa siempre que tus llaves `{}` y comillas `""` estén bien cerradas. n8n te mostrará un error si el formato es inválido.
- **Variables:** En los nodos HTTP de n8n, usa expresiones (el botón de la rueda dentada) para insertar dinámicamente el nombre del Pokémon que el usuario escribió en el chat.
- **Status Codes:** Si recibes un `200`, todo va bien. Si recibes un `404`, revisa si escribiste bien el nombre del Pokémon en la URL.

---

**¿Qué entregar?**
Exporta los archivos JSON de tus workflows o envía capturas de pantalla de tus ejecuciones exitosas donde se vea el flujo de datos en cada nodo. ¡Mucha suerte, Entrenador!
