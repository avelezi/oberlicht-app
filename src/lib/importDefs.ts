import type { ImportField } from './importer';

export const SOCIOS_FIELDS: ImportField[] = [
  { key: 'nombre', label: 'Nombre', required: true, synonyms: ['nombres', 'nombre del socio', 'first name', 'name', 'alumno', 'socio'] },
  { key: 'apellidos', label: 'Apellidos', synonyms: ['apellido', 'apellido paterno', 'last name', 'surname', 'apellidos socio'] },
  { key: 'familia', label: 'Familia', synonyms: ['nombre familia', 'familia socio', 'family', 'grupo familiar', 'titular familia'], hint: 'Si no viene, se arma con el primer apellido' },
  { key: 'numero_familia', label: 'Número de familia', synonyms: ['no familia', 'num familia', 'folio familia', 'id familia', 'family id', 'numero de socio', 'membresia', 'contrato'] },
  { key: 'id_externo', label: 'ID en el sistema anterior', synonyms: ['id', 'id socio', 'member id', 'clave', 'codigo', 'numero socio', 'id cliente', 'customer id'], hint: 'Sirve para no duplicar si vuelves a importar' },
  { key: 'titular', label: '¿Es titular?', synonyms: ['titular', 'responsable', 'tutor', 'es titular'] },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', synonyms: ['nacimiento', 'fecha nac', 'birthdate', 'date of birth', 'f nacimiento', 'cumpleanos'] },
  { key: 'socio_desde', label: 'Socio desde', synonyms: ['fecha alta', 'alta', 'fecha de alta', 'fecha ingreso', 'ingreso', 'antiguedad', 'member since', 'join date', 'fecha inscripcion', 'created'], hint: 'Con esta fecha se calcula la antigüedad' },
  { key: 'celular', label: 'Celular', synonyms: ['telefono', 'tel', 'movil', 'whatsapp', 'phone', 'mobile'] },
  { key: 'correo', label: 'Correo', synonyms: ['email', 'e mail', 'correo electronico', 'mail'] },
  { key: 'genero', label: 'Género', synonyms: ['sexo', 'gender', 'genero'] },
  { key: 'alergias', label: 'Alergias', synonyms: ['alergia', 'allergies'] },
  { key: 'notas', label: 'Notas médicas', synonyms: ['notas', 'observaciones', 'padecimientos', 'medical notes', 'comentarios'] },
  { key: 'rfc', label: 'RFC', synonyms: ['rfc', 'tax id'] },
];

export const SOCIOS_SAMPLE = [
  { nombre: 'Laura', apellidos: 'Martínez Ruiz', familia: 'Familia Martínez', numero_familia: 'PG-0151', id_externo: 'S-1001', titular: 'Sí', fecha_nacimiento: '12/03/1986', socio_desde: '15/01/2019', celular: '5512345678', correo: 'laura@ejemplo.com', genero: 'F' },
  { nombre: 'Mateo', apellidos: 'Martínez Ruiz', familia: 'Familia Martínez', numero_familia: 'PG-0151', id_externo: 'S-1002', titular: 'No', fecha_nacimiento: '05/09/2016', socio_desde: '15/01/2019', alergias: 'Penicilina', genero: 'M' },
];

export const SOCIOS_TOTALS = { familias_nuevas: 'Familias nuevas', socios_nuevos: 'Socios nuevos', actualizados: 'Actualizados', con_error: 'Con error' };

export const VISITAS_FIELDS: ImportField[] = [
  { key: 'entrada', label: 'Fecha y hora de entrada', required: true, synonyms: ['check in', 'checkin', 'entrada', 'hora entrada', 'fecha entrada', 'fecha', 'fecha hora', 'ingreso', 'date', 'time in', 'acceso'], hint: 'Si no trae zona horaria se toma como hora de CDMX' },
  { key: 'salida', label: 'Fecha y hora de salida', synonyms: ['check out', 'checkout', 'salida', 'hora salida', 'fecha salida', 'time out'] },
  { key: 'ref', label: 'ID del socio en el sistema anterior', synonyms: ['id', 'id socio', 'member id', 'clave', 'codigo', 'numero socio', 'tarjeta', 'credencial'] },
  { key: 'nombre', label: 'Nombre del socio', synonyms: ['nombre', 'socio', 'cliente', 'member', 'name', 'nombre completo'] },
  { key: 'numero_familia', label: 'Número de familia', synonyms: ['no familia', 'num familia', 'familia', 'membresia', 'contrato'] },
  { key: 'area', label: 'Área', synonyms: ['area', 'departamento', 'zona', 'servicio', 'actividad', 'puerta'], hint: 'natación, oberfit, ballet…' },
];

export const VISITAS_SAMPLE = [
  { entrada: '2026-11-20 07:05', salida: '2026-11-20 08:20', ref: 'S-1001', nombre: 'Laura Martínez Ruiz', area: 'oberfit' },
  { entrada: '2026-11-20 17:00', salida: '2026-11-20 17:55', ref: 'S-1002', nombre: 'Mateo Martínez Ruiz', area: 'natacion' },
];

export const VISITAS_TOTALS = { importados: 'Importados', repetidos: 'Ya existían', con_error: 'Con error' };
