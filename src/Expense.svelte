<script>
import { blur, slide, scale, fade, fly } from 'svelte/transition';
import { quintOut } from 'svelte/easing';
import { getContext } from 'svelte';
export let id;
export let name = '';
export let amount = 0;
let displayAmount = false;

const toogleAmount = () => {
    displayAmount = !displayAmount;
}
const removeExpense = getContext('remove');
const setModifiedExpense = getContext('modify');

</script>

<article class="single-expense">

<div class="expense-info">
<h2>{name} <button class="amount-btn"on:click={toogleAmount}><i class="fas fa-caret-down"></i></button></h2>
{#if displayAmount}
<h4 transition:slide>amount: ${amount}</h4>
{/if}
</div>

<div class="expense-buttons">
<button class="expense-btn edit-btn"><i class="fas fa-pen" on:click="{() =>setModifiedExpense(id) }"></i></button>
<button on:click="{()=>removeExpense(id)}" class="expense-btn delete-btn"><i class="fas fa-trash"></i></button>

</div>
</article>