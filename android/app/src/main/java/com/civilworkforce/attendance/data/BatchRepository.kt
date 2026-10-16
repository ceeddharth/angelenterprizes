package com.civilworkforce.attendance.data

import com.civilworkforce.attendance.model.Batch
import com.civilworkforce.attendance.model.BatchStatus
import com.civilworkforce.attendance.model.Resource
import com.civilworkforce.attendance.util.FirebaseErrorParser
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

interface BatchRepository {
    suspend fun getAllBatches(): Resource<List<Batch>>
    suspend fun getActiveBatches(): Resource<List<Batch>>
    suspend fun getBatchById(batchId: String): Resource<Batch?>
    suspend fun createBatch(batch: Batch): Resource<Unit>
    suspend fun toggleBatchStatus(batchId: String, currentStatus: BatchStatus): Resource<Unit>
}

class FirebaseBatchRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance()
) : BatchRepository {

    override suspend fun getAllBatches(): Resource<List<Batch>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_BATCHES)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                val b = doc.toObject(Batch::class.java)
                b?.copy(
                    batchId = doc.id,
                    batchNumber = if (b.batchNumber.isNotBlank()) b.batchNumber else doc.id,
                    name = if (b.name.isNotBlank()) b.name else (doc.getString("name") ?: ("Batch " + doc.id))
                )
            }.sortedBy { it.batchId }

            Resource.Success(list)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getActiveBatches(): Resource<List<Batch>> {
        return try {
            val snapshot = firestore.collection(FirebaseConstants.COLLECTION_BATCHES)
                .whereEqualTo(FirebaseConstants.FIELD_STATUS, BatchStatus.ACTIVE.name)
                .get()
                .await()

            val list = snapshot.documents.mapNotNull { doc ->
                val b = doc.toObject(Batch::class.java)
                b?.copy(
                    batchId = doc.id,
                    batchNumber = if (b.batchNumber.isNotBlank()) b.batchNumber else doc.id,
                    name = if (b.name.isNotBlank()) b.name else (doc.getString("name") ?: ("Batch " + doc.id))
                )
            }.sortedBy { it.batchId }

            Resource.Success(list)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun getBatchById(batchId: String): Resource<Batch?> {
        return try {
            val doc = firestore.collection(FirebaseConstants.COLLECTION_BATCHES)
                .document(batchId)
                .get()
                .await()

            if (doc.exists()) {
                val b = doc.toObject(Batch::class.java)
                val mapped = b?.copy(
                    batchId = doc.id,
                    batchNumber = if (b.batchNumber.isNotBlank()) b.batchNumber else doc.id,
                    name = if (b.name.isNotBlank()) b.name else (doc.getString("name") ?: ("Batch " + doc.id))
                )
                Resource.Success(mapped)
            } else {
                Resource.Success(null)
            }
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun createBatch(batch: Batch): Resource<Unit> {
        return try {
            val docRef = if (batch.batchId.isNotBlank()) {
                firestore.collection(FirebaseConstants.COLLECTION_BATCHES).document(batch.batchId)
            } else {
                firestore.collection(FirebaseConstants.COLLECTION_BATCHES).document()
            }

            val finalBatch = batch.copy(
                batchId = docRef.id,
                batchNumber = if (batch.batchNumber.isNotBlank()) batch.batchNumber else docRef.id,
                createdAt = Timestamp.now(),
                updatedAt = Timestamp.now()
            )

            docRef.set(finalBatch).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }

    override suspend fun toggleBatchStatus(batchId: String, currentStatus: BatchStatus): Resource<Unit> {
        return try {
            if (batchId.isBlank()) {
                return Resource.Error("Batch ID is missing or invalid.")
            }
            val newStatus = if (currentStatus == BatchStatus.ACTIVE) BatchStatus.INACTIVE else BatchStatus.ACTIVE
            firestore.collection(FirebaseConstants.COLLECTION_BATCHES)
                .document(batchId)
                .update(
                    mapOf(
                        FirebaseConstants.FIELD_STATUS to newStatus.name,
                        FirebaseConstants.FIELD_UPDATED_AT to Timestamp.now()
                    )
                ).await()
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(FirebaseErrorParser.parse(e), e)
        }
    }
}
