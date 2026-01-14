const { z } = require('zod');

const email = z.string().email().max(255);
const name  = z.string().min(1).max(80);

// mot de passe sans aucune contrainte de complexite
const password = z.string();
const signupSchema = z.object({ email, name, password });
const loginSchema  = z.object({ email, password });

// 💡 Sécurité: Nouveau schéma pour la mise à jour de profil
const updateProfileSchema = z.object({
    email,
    name,
    password: z.string().optional().refine(p => !p || p.length >= 8, {
        message: 'Le mot de passe doit contenir au moins 8 caractères'
    }),
});


function validate(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      const msg = r.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return res.status(400).json({ ok: false, error: msg, code: 'validation_error' }); // 💡 Stabilité: Normalisation de la réponse d'erreur de validation
    }
    req.body = r.data;
    next();
  };
}

module.exports = { validate, signupSchema, loginSchema, updateProfileSchema };