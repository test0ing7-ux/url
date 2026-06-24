const {Sequelize} = require('sequelize')
const { columns, uploadedStatus } = require('./.constants');

async function up({context: queryInterface}) {
    await queryInterface.createTable('Uploads', {
        [columns.id]: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        [columns.quizId]: {
            type: Sequelize.TEXT,
            allowNull: false
        },
        [columns.userId]: {
            type: Sequelize.TEXT,
            allowNull: false,
        },
        [columns.data]: {
            type: Sequelize.TEXT,
            allowNull: false,
        },
        [columns.uploaded]: {
            type: Sequelize.INTEGER,
            defaultValue: uploadedStatus.pending,
        },
        [columns.max_wait]: {
            type: Sequelize.DATE,
        },
        createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
        },
        updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
        },
    });
}

async function down({context: queryInterface}) {
    await queryInterface.dropTable('Uploads');
};

module.exports = {up, down};
  