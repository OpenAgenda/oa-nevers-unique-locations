<<<<<<< HEAD

=======
>>>>>>> a6ab668b5bfbe9eca2d010f8b252864826b36ba1
# Script de génération d'identifiants uniques de lieux

Script qui agit sur un ensemble prédéfini d'agendas pour générer des identifiants uniques de lieux. Ces identifiants sont sauvegardés sur un champ additionel prévu à cet effet sur chaque agenda.

L'execution se déroule en 3 phases:

  1. constitution d'un index local de lieux uniques en parcourant les événements des agendas
  2. Création de nouveaux index de lieux
  3. Patch des événemenets n'ayant pas encore d'identifiants uniques de lieu de défini

La comparaison entre deux lieux pour identifier un doublon se fait suivant deux critères:

  1. Proximité: les lieux doivent être à moins de 100m de l'un de l'autre
  2. Similitude du nom: les lieux doivent avoir un nom similaire à plus de 70% (évaluation levenshtein)

## Constitution de l'index local

Au début de l'execution du script, l'index local de lieux est vide.

Une évaluation d'événement traite les cas de figures suivants:

1. L'événement n'est pas associé à un identifiant de lieu unique
  1.1. Le lieu de l'événement ne correspond à aucun lieu sur l'index local: le lieu est ajouté à l'index local
  1.2. Le lieu de l'événement correspond à un lieu sur l'index local: la référence de l'événement est ajoutée au lieu sur l'index local et est marqué comme devant être mis à jour à la fin de l'execution du script

2. L'événement est associé à un identifiant de lieu unique
  2.1 Le lieu est déjà référencé sur l'index local par évaluation sur son identifiant unique: la référence de l'événement est ajoutée au lieu sur l'index local
  2.2 Le lieu est déjà référencé sur l'index local par évaluation sur une similitude geo+levenshtein: la référence de l'événement est ajoutée au lieu sur l'index local et est marqué comme devant être mis à jour à la fin de l'execution du script
  2.3 Le lieu n'est pas référencé sur l'index local: la référence de l'événement est ajoutée au lieu sur l'index local ainsi que l'identifiant unique du lieu

