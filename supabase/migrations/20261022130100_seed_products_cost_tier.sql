-- Clasificación inicial del nivel de costo de las viandas (estudio del 2026-10-22).
-- Costo por porción = cantidad x costo actual de ingredientes / rendimiento de la receta.
--   bajo  < $3.300 | medio $3.300-$4.400 | alto > $4.400 (sobre precio estándar de $11.000).
-- 'real'     = receta completa. 'estimado' = sin receta o receta incompleta: mediana de su familia
--              (pollo, pasta, verdura/huevo, vacuno, cerdo, pescado, ensalada, empanada, tarta/pizza).
-- Solo completa productos sin nivel (nunca pisa una edición manual) y que existan por nombre.
-- Revisar los 'estimado' desde Productos > Nivel de costo.
update public.products p
set cost_tier = v.tier
from (values
  ('Arroz con pollo', 'bajo'), -- estimado
  ('Risotto con pollo', 'bajo'), -- estimado
  ('Risotto de atun', 'bajo'), -- estimado
  ('Risotto de calabaza', 'bajo'), -- estimado
  ('Risotto de hongos', 'bajo'), -- estimado
  ('Risotto de remolacha', 'bajo'), -- estimado
  ('Rissoto con pollo y arvejas', 'bajo'), -- real
  ('Buda Bowl ( con garbanzos)', 'bajo'), -- estimado
  ('Buda Bowl proteico', 'bajo'), -- estimado
  ('Buda bowl proteico con lentejas', 'bajo'), -- estimado
  ('Cazuela de lentejas', 'bajo'), -- estimado
  ('Colchon de lentejas', 'bajo'), -- estimado
  ('Guiso de lentejas con carne de cerdo', 'bajo'), -- real
  ('Hamburguesa de garbanzos con verduras asadas', 'bajo'), -- real
  ('Canelones de calabaza y choclo', 'bajo'), -- estimado
  ('Canelones de verdura con salsa mixta', 'bajo'), -- real
  ('Canelones de zanahoria rellenos de espinaca', 'bajo'), -- estimado
  ('Guiso con Mostachole/Tirausones/ arroz', 'bajo'), -- estimado
  ('Lasagna de verduras', 'bajo'), -- estimado
  ('Lasagña de zuquinis', 'bajo'), -- estimado
  ('Noquis con salsa caprese', 'bajo'), -- real
  ('Ravioles de verdura con salsa filetto y blanca', 'bajo'), -- estimado
  ('Tallarines al pesto', 'bajo'), -- real
  ('Tallarines con salsa parisienne', 'bajo'), -- real
  ('Tallarines con verduras salteadas', 'bajo'), -- estimado
  ('Ñoquis con salsa capresse', 'bajo'), -- estimado
  ('Pechuga Rellena', 'bajo'), -- real
  ('Pollo al verdeo con arroz moldeado', 'bajo'), -- real
  ('Arepas con ensalada', 'bajo'), -- estimado
  ('BONIATO RELLENO', 'bajo'), -- estimado
  ('Blinis de espinaca con ensalada', 'bajo'), -- real
  ('Budin de calabaza y queso con ensalada', 'bajo'), -- estimado
  ('Budin de verduras', 'bajo'), -- estimado
  ('Budin de zapallitos', 'bajo'), -- estimado
  ('Budin de zuquinis con ensalada', 'bajo'), -- estimado
  ('Calabaza rellena con espinaca', 'bajo'), -- estimado
  ('Calzone de cebolla y jamon/ napolitano', 'bajo'), -- estimado
  ('Canastitas verdura Para Vianda', 'bajo'), -- estimado
  ('Conos de calabaza y queso', 'bajo'), -- estimado
  ('Conos de ricotta y acelga', 'bajo'), -- estimado
  ('Conos de verdura salteada y queso', 'bajo'), -- estimado
  ('Creps de remolacha rellenos rucula y mooza.', 'bajo'), -- estimado
  ('Creps de rucula con queso y cherry', 'bajo'), -- estimado
  ('Creps de zanahoria rellenos con espinaca y mooza.', 'bajo'), -- estimado
  ('Low carb', 'bajo'), -- estimado
  ('Medallon de verdura con ensalada', 'bajo'), -- estimado
  ('Medallon de verduras con ensalada', 'bajo'), -- estimado
  ('Milanesa de berenjena con ensalada', 'bajo'), -- estimado
  ('Milanesa de calabaza con ensalada', 'bajo'), -- estimado
  ('Milanesa de calabaza con verduras/ensalada', 'bajo'), -- estimado
  ('Milhojas de papa y calabaza', 'bajo'), -- estimado
  ('Milhojas de verdura', 'bajo'), -- estimado
  ('Muffins de calazaba', 'bajo'), -- estimado
  ('Muffins de papa con ensalada', 'bajo'), -- estimado
  ('Muffins de verdura y queso', 'bajo'), -- estimado
  ('Nuggets de brocoli', 'bajo'), -- estimado
  ('Omelet caprese', 'bajo'), -- estimado
  ('Omelete de arvejas con ensalada', 'bajo'), -- estimado
  ('Omelett Brocoli', 'bajo'), -- estimado
  ('Omelette de champinones', 'bajo'), -- estimado
  ('Omelette de espinaca con ensalada', 'bajo'), -- estimado
  ('Omelette de jamon y queso con ensalada', 'bajo'), -- estimado
  ('Omelette de zanahoria y muzzarella con ensalada', 'bajo'), -- real
  ('Omellets caprese', 'bajo'), -- estimado
  ('Omellets de brocoli y queso', 'bajo'), -- estimado
  ('Omellets de champiñones y queso', 'bajo'), -- estimado
  ('Omellets de espinaca y queso', 'bajo'), -- estimado
  ('Omellets de jamon y queso', 'bajo'), -- real
  ('Panuelitos de calabaza y choclo', 'bajo'), -- estimado
  ('Panuelitos de humita con salsa blanca', 'bajo'), -- estimado
  ('Quesadilla de zanahoria con ensalada', 'bajo'), -- estimado
  ('Salteado de verduras con arroz yamani', 'bajo'), -- estimado
  ('Salteado de verduras con fideos de arroz', 'bajo'), -- estimado
  ('Tacos vegetarinos', 'bajo'), -- real
  ('Tarta de verduras con ensalada', 'bajo'), -- estimado
  ('Timbal de berenjenas', 'bajo'), -- estimado
  ('Torre de berenjenas', 'bajo'), -- estimado
  ('Tortilla de verduras con ensalada', 'bajo'), -- real
  ('Tortilla de zapallitos con ensalada', 'bajo'), -- estimado
  ('Wraps caprese con ensalada', 'bajo'), -- estimado
  ('Zapalliitos Rellenos', 'bajo'), -- estimado
  ('Zapallitos rellenos con jamon y ricotta', 'bajo'), -- estimado
  ('Empanada de carne con ensalada', 'medio'), -- estimado
  ('Empanadas de atun con ensalada', 'medio'), -- estimado
  ('Empanadas de carne vianda', 'medio'), -- estimado
  ('Empanadas de pollo con ensalada', 'medio'), -- estimado
  ('Empanadas de verdura con ensalada', 'medio'), -- estimado
  ('Ensalada con kanikama', 'medio'), -- real
  ('Ensalada nicosse', 'medio'), -- real
  ('Guiso de lentejas', 'medio'), -- real
  ('Tallarines con salsa de espinaca champinones y pollo', 'medio'), -- real
  ('Arrollado de pollo', 'medio'), -- estimado
  ('Brochete de pollo con ensalada de remolacha', 'medio'), -- estimado
  ('Cazuela de pollo con base de arroz', 'medio'), -- real
  ('Milanesa de pollo con fideos', 'medio'), -- estimado
  ('Pastel de calabaza y pollo', 'medio'), -- estimado
  ('Pata muslo con pure', 'medio'), -- estimado
  ('Pata y muslo con ensalada/acompanada', 'medio'), -- estimado
  ('Pechuga Caprese con papas/ pure', 'medio'), -- estimado
  ('Pechuga Grille Caprese con pure', 'medio'), -- real
  ('Pechuga a la barbacoa con verduras asadas', 'medio'), -- estimado
  ('Pechuga a la suiza', 'medio'), -- estimado
  ('Pechuga al limon con ensalada', 'medio'), -- estimado
  ('Pechuga con dip de remolacha y ensalada rusa', 'medio'), -- estimado
  ('Pechuga con dip de zanahoria y ensalada coleslaw', 'medio'), -- estimado
  ('Pechuga con ensalada', 'medio'), -- estimado
  ('Pechuga con fideos', 'medio'), -- estimado
  ('Pechuga con salsa de espinaca', 'medio'), -- estimado
  ('Pechuga con salsa de puerros con pure calabaza', 'medio'), -- real
  ('Pechuga con salsa de verdeo y pure de papa/ cubos de calabaza', 'medio'), -- estimado
  ('Pechuga con zapallitos salteados', 'medio'), -- estimado
  ('Pechuga crujiente con ensalada', 'medio'), -- estimado
  ('Pechuga en cubos con salsa de puerros', 'medio'), -- estimado
  ('Pechuga grillada con verduras asadas', 'medio'), -- estimado
  ('Pechuga rellena con tomate y jamon y pure de calabaza', 'medio'), -- real
  ('Pollo a la portuguesa con papas', 'medio'), -- estimado
  ('Pollo al Disco Light', 'medio'), -- estimado
  ('Pollo al disco con papas', 'medio'), -- estimado
  ('Suprema con ensalada coleslaw', 'medio'), -- estimado
  ('Suprema con pure de calabaza', 'medio'), -- real
  ('Tacos con verduras y pollo', 'medio'), -- real
  ('Pizza con base de brocoli/ coliflor', 'medio'), -- estimado
  ('Pizzetas con ensalada', 'medio'), -- estimado
  ('Tarta Individual Atun', 'medio'), -- estimado
  ('Tarta Individual JyQ', 'medio'), -- real
  ('Tarta Individual Pollo', 'medio'), -- real
  ('Tarta Individual de Cebolla', 'medio'), -- real
  ('Tarta Individual verdura', 'medio'), -- real
  ('Tarta individual calabaza', 'medio'), -- estimado
  ('Tarta individual caprese', 'medio'), -- estimado
  ('Albondigas con arroz', 'medio'), -- estimado
  ('Arrollado primavera', 'medio'), -- estimado
  ('Arrollado primavera con ensalada', 'medio'), -- estimado
  ('Hamburguesas con papas', 'medio'), -- estimado
  ('Hamburguesas con verduras asadas/ pure', 'medio'), -- estimado
  ('Locro', 'medio'), -- real
  ('Mousaka', 'medio'), -- estimado
  ('Pan de carne relleno con pure de calabaza', 'medio'), -- estimado
  ('Pastel de calabaza y papa con carne', 'medio'), -- estimado
  ('Pastel de calabaza, choclo y carne', 'medio'), -- estimado
  ('Pastel de papa y carne', 'medio'), -- estimado
  ('Rolls de carne con budin de zanahoria', 'medio'), -- estimado
  ('Salteado de verduras con carne', 'medio'), -- estimado
  ('Zapallitos rellenos con carne picada', 'medio'), -- real
  ('Berenjenas a la parmegiana con ensalada', 'medio'), -- real
  ('Budin bicolor ( calabaza y acelga )', 'medio'), -- real
  ('Milanesas de berenjenas/ zuquinis con salteado de verduras', 'medio'), -- real
  ('Bondiola braseada sobre colchon de boniato', 'alto'), -- estimado
  ('Carre de cerdo con pure de batata', 'alto'), -- estimado
  ('Cerdo con vegetales y cubos de calabaza', 'alto'), -- real
  ('Chuleta de Cerdo con pure de papas/batata', 'alto'), -- real
  ('Chuletas de cerdo con verduras asadas', 'alto'), -- estimado
  ('Milanesa de cerdo con ensalada de repollo y zanahoria', 'alto'), -- estimado
  ('Milanesa de cerdo con puré de calabaza/ papa', 'alto'), -- estimado
  ('Milanesas de cerdo con pure de calabaza/ papa', 'alto'), -- estimado
  ('Sandwich de bondiola', 'alto'), -- estimado
  ('Tacos con verduras y cerdo', 'alto'), -- estimado
  ('Ensalada Cesar', 'alto'), -- real
  ('Ensalada completa', 'alto'), -- estimado
  ('Ensalada completa con pollo y tirabuzon', 'alto'), -- estimado
  ('Ensalada completa vianda', 'alto'), -- estimado
  ('Ensalada con arroz yamani', 'alto'), -- estimado
  ('Ensalada con lentejas', 'alto'), -- estimado
  ('Ensalada con pasta y atun', 'alto'), -- estimado
  ('Ensalada con pollo', 'alto'), -- estimado
  ('Ensalada invernal', 'alto'), -- estimado
  ('Ensalada palermitana', 'alto'), -- real
  ('Ensalada palermitana con pollo', 'alto'), -- estimado
  ('Ensalada retuneada', 'alto'), -- estimado
  ('Ensalada tibia con pollo', 'alto'), -- estimado
  ('Salpicon de ave', 'alto'), -- estimado
  ('Filete de merluza con pure', 'alto'), -- estimado
  ('Medallon de Pescado con Ensalada', 'alto'), -- estimado
  ('Merluza a la pizza', 'alto'), -- estimado
  ('Milanesas de pescado con pure de calabaza/ papa', 'alto'), -- estimado
  ('Milhojas de pescado y verduras', 'alto'), -- estimado
  ('Pescado Crujiente', 'alto'), -- estimado
  ('Pescado a la Pizza', 'alto'), -- real
  ('Pescado a la Portuguesa', 'alto'), -- real
  ('Pescado al roquefort con pure de calabaza/ zanahorias', 'alto'), -- estimado
  ('Pescado con salsa filete y arroz perejilado', 'alto'), -- estimado
  ('Pescado mediterraneo con cubo de calabaza', 'alto'), -- estimado
  ('Roll de Gatuzo', 'alto'), -- estimado
  ('Rolls de pescado con pure de calabaza', 'alto'), -- estimado
  ('Wrap de atun y verduras', 'alto'), -- estimado
  ('Pechuga con pure', 'alto'), -- real
  ('Pizza Muzzarela Individual', 'alto'), -- real
  ('Pizza individual de brocoli', 'alto'), -- real
  ('Bife con veduras asadas', 'alto'), -- estimado
  ('Bifes a la Criolla con pure', 'alto'), -- real
  ('Cazuela de carne con arroz', 'alto'), -- estimado
  ('Cazuela de carne y verduras', 'alto'), -- estimado
  ('Colita de Cuadril a la mostaza con pure', 'alto'), -- estimado
  ('Colita de cuadril a la portuguesa', 'alto'), -- estimado
  ('Colita de cuadril a la portuguesa con pure rustico', 'alto'), -- real
  ('Colita de cuadril con cebolla y morron salteado y papa hervida', 'alto'), -- estimado
  ('Goulash', 'alto'), -- real
  ('Tacos con verduras y ternera', 'alto'), -- estimado
  ('Tiras de carne a la mostaza', 'alto'), -- estimado
  ('Tiras de carne con zanahorias y cebollas', 'alto') -- estimado
) as v(name, tier)
where btrim(p.name) = v.name
  and p.category = 'Viandas'
  and p.cost_tier is null;
