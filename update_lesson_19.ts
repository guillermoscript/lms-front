import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const lessonId = 29; // ID for Lesson 19
  const newContent = `# Lección 19: Lugares y Direcciones (Places and Directions)

Saber cómo moverse en una ciudad nueva es una de las habilidades más prácticas que puedes tener. En esta lección aprenderemos a identificar lugares y, lo más importante, a pedir y dar direcciones.

## 1. Lugares en la Ciudad (Places in Town)

Ampliemos nuestro vocabulario con lugares comunes que encontrarás en cualquier ciudad:

| Inglés | Español | Descripción / Ejemplo |
| :--- | :--- | :--- |
| **Bakery** | Panadería | "I buy bread at the bakery." |
| **Pharmacy / Drugstore** | Farmacia | "I need medicine from the pharmacy." |
| **Hospital** | Hospital | "The hospital is open 24 hours." |
| **Post Office** | Oficina de correos | "I need to send a letter at the post office." |
| **Gym** | Gimnasio | "I go to the gym every morning." |
| **Museum** | Museo | "The art museum is beautiful." |
| **Police Station** | Estación de policía | "The police station is next to the bank." |
| **School** | Escuela | "The children are at school." |

## 2. Preguntando por Direcciones (Asking for Directions)

Antes de pedir ayuda, siempre es bueno empezar con una frase de cortesía:

*   **Excuse me, could you help me?** (Disculpe, ¿podría ayudarme?)
*   **Excuse me, where is the...?** (Disculpe, ¿dónde está el/la...?)
*   **How can I get to the...?** (¿Cómo puedo llegar a...?)
*   **Is there a [place] near here?** (¿Hay un [lugar] cerca de aquí?)

**Ejemplo:**
"Excuse me, is there a supermarket near here?"

## 3. Dando Direcciones (Giving Directions)

Cuando alguien te pregunte, o cuando tú recibas instrucciones, escucharás estas frases clave:

### Acciones de Movimiento:
*   **Go straight ahead** (Siga derecho)
*   **Turn left** (Gire a la izquierda)
*   **Turn right** (Gire a la derecha)
*   **Go past [the bank]** (Pase por delante del [banco])
*   **Cross the street** (Cruce la calle)

### Ubicación Final:
*   **It's on your left** (Está a su izquierda)
*   **It's on your right** (Está a su derecha)
*   **It's at the corner** (Está en la esquina)
*   **It's across from...** (Está frente a / al otro lado de...)

## 4. Diálogo de Práctica (Practice Dialogue)

**Tourist:** Excuse me, how can I get to the Cinema?
**Local:** Go straight ahead for two blocks. Then, turn right at the Pharmacy. The Cinema is across from the Park.
**Tourist:** Thank you very much!
**Local:** You're welcome!

---

### 💡 Tip Cultural: Cinema vs. Movie Theater
En el Reino Unido (UK) es muy común decir **Cinema**, mientras que en Estados Unidos (USA) se suele usar más **Movie Theater**. ¡Ambos son correctos y te entenderán en cualquier lugar!

### 📝 Mini-Reto:
Imagina que estás en tu lugar favorito de tu ciudad. ¿Qué hay **across from** (frente a) ese lugar? ¡Piénsalo en inglés!`;

  const { error } = await supabase
    .from('lessons')
    .update({ content: newContent })
    .eq('id', lessonId);

  if (error) {
    console.error('Error updating lesson 19:', error);
  } else {
    console.log('Lesson 19 updated with comprehensive content.');
  }
}

main();
