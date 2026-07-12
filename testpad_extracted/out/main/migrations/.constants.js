const columns = {
    'id': 'id',
    'quizId': 'quizId',
    'userId': 'userId',
    'data': 'data',
    'uploaded': 'uploaded',
    'max_wait': 'max_wait',
}
const tableName = 'Uploads';

const uploadedStatus = {
    pending: 0,
    uploaded: 1,
    error: 2,
}

module.exports = {
    columns,
    tableName,
    uploadedStatus,
}